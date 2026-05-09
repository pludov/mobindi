'use strict';

import "source-map-support/register";
import express, { Response } from 'express';
import {Application as ExpressApplication} from "express-serve-static-core";

import fs from 'fs';
import os from 'os';
import http from 'http';
import cors from 'cors';
import bodyParser from 'body-parser';
import * as WebSocket from 'ws';
import uuid from 'node-uuid';

//@ts-ignore
import cgi = require('cgi');

import Client from './Client';
import Phd from './Phd';
import IndiManager from './IndiManager';
import Camera from './Camera';
import Focuser from './Focuser';
import ImageProcessor from './ImageProcessor';
import ImagingSetupManager from './ImagingSetupManager';


import JsonProxy from './shared/JsonProxy';
import TriggerExecuter from './TriggerExecuter';
import ToolExecuter from './ToolExecuter';

import Astrometry from './Astrometry';

import { AppContext } from "./ModuleBase";
import { BackofficeStatus } from "./shared/BackOfficeStatus";
import * as RequestHandler from "./RequestHandler";

import Sleep from "./Sleep";
import { createTask, Task } from "./Task.js";
import CancellationToken from "cancellationtoken";
import ClientRequest from "./ClientRequest";
import FilterWheel from "./FilterWheel";
import SequenceManager from "./SequenceManager";
import Notification from "./Notification";
import Log from './Log';

import * as Metrics from "./Metrics";
import SystemDeviceManager from "./SystemDeviceManager";

const logger = Log.logger(__filename);

const serverId = uuid.v4();

var appStateManager = new JsonProxy<BackofficeStatus>();
var appState = appStateManager.getTarget();
let apiRoot: RequestHandler.APIImplementor;

function parseRequestId(id: any) : string|null {
    if ((typeof id !== "string")&&(typeof id !== "number")) {
        logger.warn("Invalid request id", {id});
        return null;
    }
    return `${id}`;
}


function initWss(server: http.Server) {
    const wss = new WebSocket.Server({
        server: server,
        perMessageDeflate: {
            zlibDeflateOptions: {
                // See zlib defaults.
                chunkSize: 1024,
                memLevel: 7,
                level: 3
            },
            zlibInflateOptions: {
                chunkSize: 8 * 1024
            },
            // // Other options settable:
            // clientNoContextTakeover: true, // Defaults to negotiated value.
            // serverNoContextTakeover: true, // Defaults to negotiated value.
            serverMaxWindowBits: 10, // Defaults to negotiated value.
            // Below options specified as default values.
            concurrencyLimit: 4, // Limits zlib concurrency for perf.
            threshold: 1024 // Size (in bytes) below which messages should not be compressed.
        }
    });
    wss.on('error', (err)=>{
        logger.warn('websocket server error', err);
    });

    // Validate a dynamicWhiteList payload from the client (prevents injection of unexpected types).
    // Only the JSON-safe WhiteList shape is accepted: undefined/null, boolean, or
    // { props?: { [key]: WhiteList }, wildcard?: WhiteList } with no extra keys.
    function isValidWhiteListPayload(v: any, maxDepth: number): boolean {
        if (v === null || v === undefined) return true;
        if (typeof v === 'boolean') return true;
        if (typeof v !== 'object' || Array.isArray(v)) return false;
        if (maxDepth <= 0) return false;
        for (const key of Object.keys(v)) {
            if (key !== 'props' && key !== 'wildcard') return false;
        }
        if (v.props !== undefined) {
            if (typeof v.props !== 'object' || Array.isArray(v.props)) return false;
            for (const key of Object.keys(v.props)) {
                if (!isValidWhiteListPayload(v.props[key], maxDepth - 1)) return false;
            }
        }
        if (v.wildcard !== undefined) {
            if (!isValidWhiteListPayload(v.wildcard, maxDepth - 1)) return false;
        }
        return true;
    }

    function isValidOptionalDataTag(v: any): boolean {
        return v === undefined || typeof v === 'string';
    }

    let clientId = 1;

    wss.on('connection', (ws:WebSocket)=>{
        const clientUid = "#" + (clientId++);
        let client : Client;
        ws.on('message', function incoming(messageData:WebSocket.Data) {
            logger.debug('received websocket message', {clientUid, messageData});

            let message: any;
            try {
                message = JSON.parse(messageData.toString());
            } catch(e) {
                logger.warn('Invalid websocket message', {clientUid}, e);
                ws.terminate();
                return;
            }

            if (client === undefined) {
                if (message.type === "auth") {
                    if (!isValidOptionalDataTag(message.dataTag)) {
                        logger.warn('Invalid auth dataTag payload', {clientUid});
                        ws.terminate();
                        return;
                    }
                    client = new Client(ws, appStateManager, serverId, clientUid, message.whiteList, message.dataTag);
                } else {
                    logger.warn('Unautorized websocket message', {clientUid});
                    ws.terminate();
                }
                return;
            }
            if (message.type === "srvProbe") {
                client.onProbeReceived(message);
                return;
            }
            if (message.type === "dynamicWhiteList") {
                if (!isValidWhiteListPayload(message.whiteList, 8)) {
                    logger.warn('Invalid dynamicWhiteList payload', {clientUid});
                    ws.terminate();
                    return;
                }
                if (!isValidOptionalDataTag(message.dataTag)) {
                    logger.warn('Invalid dynamicWhiteList dataTag payload', {clientUid});
                    ws.terminate();
                    return;
                }
                client.setDynamicWhiteList(message.whiteList, message.dataTag);
                return;
            }
            if (message.type === "interrupt") {
                const id = parseRequestId(message.id);
                if (id === null) {
                    ws.terminate();
                    return;
                }
                client.cancelRequested(id);
                return;
            }

            if (message.type === "api") {
                const id = parseRequestId(message.id);
                if (id === null) {
                    ws.terminate();
                    return;
                }

                const globalUid = client.uid + ':' + id;

                logger.debug('API request', {clientUid, message, globalUid});
                const request = client.newRequest(id);

                createTask<any>(undefined, async (task)=> {
                    request.task = task;

                    let _app:string, _func:string;
                    _app = "N/A";
                    _func = "N/A";
                    try {
                        _app = message.details._app;
                        if (_app === undefined || ! Object.prototype.hasOwnProperty.call(apiRoot, _app)) {
                            throw new Error("Invalid _app: " + _app);
                        }
                        request.app = _app;

                        const appImpl:RequestHandler.APIAppImplementor<any> = (apiRoot as any)[_app];

                        _func = message.details._func;
                        if (_func === undefined || !Object.prototype.hasOwnProperty.call(appImpl, _func)) {
                            throw new Error("Invalid _func: " + _app + "." + _func);
                        }
                        request.func = _func;

                        logger.info('API request', {clientUid, globalUid, _app, _func});
                        const funcImpl = appImpl[_func];
                        let ret;
                        try {
                            ret = await funcImpl(task.cancellation, message.details.payload, {
                                stream: request.stream,
                                setInterruptible: request.setInterruptible,
                            });
                        } finally {
                            // Wait here to avoid sending inconsistent state
                            // (let all setimmediate settle down)
                            await Sleep(CancellationToken.CONTINUE, 0);
                        }
                        logger.debug('API result', {clientUid, globalUid, _app, _func, ret});
                        logger.info('API request succeded', {clientUid, globalUid, _app, _func});
                        request.success(ret);
                    } catch(e) {
                        if (e instanceof CancellationToken.CancellationError) {
                            logger.info('API request canceled', {clientUid, globalUid, _app, _func});
                            request.onCanceled();
                        } else {
                            logger.warn('API request failed', {clientUid, globalUid, _app, _func}, e);
                            request.onError(e);
                        }
                    }
                });
            }
        });

        ws.on('close', function (code, reason) {
            logger.info('Websocket closed', {clientUid});
            if (client !== undefined) {
                client.dispose();
            }
        });
    });
}

function init() {

    const app:ExpressApplication = express();
    
    app.use(express.static('ui/build'));

    // Log every non static http requests
    app.use((req, res, next)=> {
        const {method, url} = req;
        logger.debug("Request", method, url);
        next();
    });

    // parse application/x-www-form-urlencoded
    app.use(bodyParser.urlencoded({ extended: false }))

    // parse application/json
    app.use(bodyParser.json());

    app.use(cors({
        origin: true,
        credentials: true
    }));

    appState.apps= {
        phd: {
            enabled: true,
            position: 1
        },
        indiManager: {
            enabled: true,
            position: 2
        },
        camera: {
            enabled: true,
            position: 3
        },
        sequence: {
            enabled: true,
            position: 4
        },
        focuser: {
            enabled: true,
            position: 5
        },
        astrometry: {
            enabled: true,
            position: 6,
        },
        toolExecuter: {
            enabled: true,
            position: 7,
        },
        messages: {
            enabled: true,
            position: 8,
        }
    };

    appState.uiConfig = {
        directPort: parseInt(process.env.PORT || '8080')
    };

    let context:Partial<AppContext> = {
    };

    app.get('/metrics', async (req, res, next) => {
        try {
            const metrics = [
                ...await context.indiManager!.metrics(),
                ...await context.phd!.metrics(),
                ...await context.sequenceManager!.metrics(),
            ];

            res.send(Metrics.format(metrics));
        } catch (e) {
            logger.warn("Error collecting metrics", e);
            next(e);
        }
    });

    const ca_certs = process.env.CA_CERTS;
    if (ca_certs) {
        app.get('/cacerts', async (req, res, next) => {
            try {
                const data = await fs.promises.readFile(ca_certs, 'utf-8');
                res.header('Content-Type', 'application/octet-stream');
                res.header('Content-Disposition', `attachment; filename="mobindi-${os.hostname()}ca-certs.pem`);
                res.status(200);
                res.send(data);
            } catch(e) {
                logger.error('Error reading CA_CERTS', e);
                next(e);
            }
        });
    };

    const server = http.createServer(app);
    server.on('error', (err)=>{
        logger.error('Got express error', err);
        server.close();
    });

    app.use(cgi('fitsviewer/fitsviewer.cgi',  { nph: true, dupfd: true }));

    app.set('port', appState.uiConfig.directPort);
    server.listen({port: appState.uiConfig.directPort}, ()=> {

        context.systemDeviceManager = new SystemDeviceManager();

        context.notification = new Notification(app, appStateManager, context as AppContext, serverId);

        context.imagingSetupManager = new ImagingSetupManager(app, appStateManager, context as AppContext);

        context.imageProcessor = new ImageProcessor(appStateManager, context as AppContext);

        context.phd = new Phd(app, appStateManager, context as AppContext);

        context.indiManager = new IndiManager(app, appStateManager, context as AppContext);

        context.camera = new Camera(app, appStateManager, context as AppContext);

        context.sequenceManager = new SequenceManager(app, appStateManager, context as AppContext);

        context.filterWheel = new FilterWheel(app, appStateManager, context as AppContext);

        context.triggerExecuter = new TriggerExecuter(appStateManager, context as AppContext);

        context.toolExecuter = new ToolExecuter(appStateManager, context as AppContext);

        context.focuser = new Focuser(app, appStateManager, context as AppContext);

        context.astrometry = new Astrometry(app, appStateManager, context as AppContext);

        context.systemDeviceManager!.run();

        apiRoot = {
            notification: context.notification.getAPI(),
            focuser: context.focuser.getAPI(),
            filterWheel: context.filterWheel.getAPI(),
            toolExecuter: context.toolExecuter.getAPI(),
            astrometry: context.astrometry.getAPI(),
            indi: context.indiManager.getAPI(),
            camera: context.camera.getAPI(),
            sequence: context.sequenceManager.getAPI(),
            imageProcessor: context.imageProcessor.getAPI(),
            phd: context.phd.getAPI(),
            imagingSetupManager: context.imagingSetupManager.getAPI(),
            systemDeviceManager: context.systemDeviceManager.getAPI(),
        };
        
        initWss(server);

        context.notification!.notify("Mobindi started");
    });
};


setImmediate(()=> {
    try {
        init()
    } catch(error) {
        logger.error('Initialisation error', error);
    }
});




