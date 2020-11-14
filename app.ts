'use strict';

import "source-map-support/register";
import express, { Response } from 'express';
import {Application as ExpressApplication} from "express-serve-static-core";

import http from 'http';
import cors from 'cors';
import bodyParser from 'body-parser';
import * as WebSocket from 'ws';
import uuid from 'node-uuid';

//@ts-ignore
import cgi = require('cgi');
import session from 'express-session';
import SessionFileStore from 'session-file-store';

import Client from './Client';
import Phd from './Phd';
import IndiManager from './IndiManager';
import Camera from './Camera';
import Focuser from './Focuser';
import ImageProcessor from './ImageProcessor';
import ImagingSetupManager from './ImagingSetupManager';


import JsonProxy from './JsonProxy';
import TriggerExecuter from './TriggerExecuter';
import ToolExecuter from './ToolExecuter';

import Astrometry from './Astrometry';

import { AppContext } from "./ModuleBase";
import { BackofficeStatus } from "./shared/BackOfficeStatus";
import * as RequestHandler from "./RequestHandler";

import Sleep from "./Sleep";
import { createTask } from "./Task.js";
import CancellationToken from "cancellationtoken";
import ClientRequest from "./ClientRequest";
import FilterWheel from "./FilterWheel";
import SequenceManager from "./SequenceManager";
import Notification from "./Notification";
import Log from './Log';

import * as Metrics from "./Metrics";

const logger = Log.logger(__filename);

const serverId = uuid.v4();

var appStateManager = new JsonProxy<BackofficeStatus>();
var appState = appStateManager.getTarget();
let apiRoot: RequestHandler.APIImplementor;


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
    //wss.use(sharedsession(session));


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
                    client = new Client(ws, appStateManager, serverId, clientUid, message.whiteList);
                } else {
                    logger.warn('Unautorized websocket message', {clientUid});
                    ws.terminate();
                }
                return;
            }
            if (message.type === "api") {
                var id = message.id;
                if (id === undefined) id = null;

                const globalUid = client.uid + ':' + id;

                logger.debug('API request', {clientUid, message, globalUid});

                const request = new ClientRequest(globalUid, client);

                createTask<any>(undefined, async (task)=> {
                    let _app, _func:string;
                    _app = "N/A";
                    _func = "N/A";
                    try {
                        _app = message.details._app;
                        if (_app === undefined || ! Object.prototype.hasOwnProperty.call(apiRoot, _app)) {
                            throw new Error("Invalid _app: " + _app);
                        }
                        const appImpl:RequestHandler.APIAppImplementor<any> = (apiRoot as any)[_app];

                        _func = message.details._func;
                        if (_func === undefined || !Object.prototype.hasOwnProperty.call(appImpl, _func)) {
                            throw new Error("Invalid _func: " + _app + "." + _func);
                        }

                        logger.info('API request', {clientUid, globalUid, _app, _func});
                        const funcImpl = appImpl[_func];
                        let ret;
                        try {
                            ret = await funcImpl(task.cancellation, message.details.payload);
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
                            request.onCancel();
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
    const FileStore = SessionFileStore(session);

    app.use(express.static('ui/build'));

    // Log every non static http requests
    app.use((req, res, next)=> {
        const {method, url} = req;
        logger.debug("Request", method, url);
        next();
    });

    app.use(session({
        store: new FileStore({}),
        cookie: {
            maxAge: 31 * 24 * 3600000,
            secure: false
        },
        saveUninitialized: true,
        resave: false,
        unset: 'destroy',
        secret: 'where this secret should be stored?'
    }));

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

    const server = http.createServer(app);
    server.on('error', (err)=>{
        logger.error('Got express error', err);
        server.close();
    });

    app.use(cgi('fitsviewer/fitsviewer.cgi',  { nph: true, dupfd: true }));

    app.set('port', appState.uiConfig.directPort);
    server.listen({port: appState.uiConfig.directPort}, ()=> {
        context.notification = new Notification(app, appStateManager, context as AppContext, serverId);

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

        context.imagingSetupManager = new ImagingSetupManager(app, appStateManager, context as AppContext);

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




