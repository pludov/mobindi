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

import JsonProxy from './JsonProxy';
import TriggerExecuter from './TriggerExecuter';
import ToolExecuter from './ToolExecuter';

import Astrometry from './Astrometry';

import { AppContext } from "./ModuleBase";
import { BackofficeStatus } from "./shared/BackOfficeStatus";
import * as RequestHandler from "./RequestHandler";

import { createTask } from "./Task.js";
import CancellationToken from "cancellationtoken";
import ClientRequest from "./ClientRequest";

const app:ExpressApplication = express();
const FileStore = SessionFileStore(session);

app.use(express.static('ui/build'));

var sessionParser;
app.use(sessionParser = session({
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


var appStateManager = new JsonProxy<BackofficeStatus>();
var appState = appStateManager.getTarget();

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


var context:Partial<AppContext> = {
};

context.imageProcessor = new ImageProcessor(appStateManager, context as AppContext);

context.phd = new Phd(app, appStateManager);

context.indiManager = new IndiManager(app, appStateManager, context as AppContext);

context.camera = new Camera(app, appStateManager, context as AppContext);

context.triggerExecuter = new TriggerExecuter(appStateManager, context as AppContext);

context.toolExecuter = new ToolExecuter(appStateManager, context as AppContext);

context.focuser = new Focuser(app, appStateManager, context as AppContext);

context.astrometry = new Astrometry(app, appStateManager, context as AppContext);

const apiRoot: RequestHandler.APIImplementor = {
    focuser: context.focuser.getAPI(),
    toolExecuter: context.toolExecuter.getAPI(),
    astrometry: context.astrometry.getAPI(),
};

app.use(function(req, res:Response, next) {
    if (Object.prototype.hasOwnProperty.call(res, 'jsonResult')) {
        const jsonResult = (res as any).jsonResult;
        res.status(200);
        res.contentType('application/json');
        // res.header('Cache-Control', 'no-cache');
        res.header("Cache-Control", "no-cache, no-store, must-revalidate");
        res.header("Pragma", "no-cache");
        res.header("Expires", "0");
        console.log('API Returning: ' + jsonResult);
        res.send(JSON.stringify(jsonResult));
    } else {
        next();
    }
});

const server = http.createServer(app);

const wss = new WebSocket.Server({ server: server });

//wss.use(sharedsession(session));

var serverId = uuid.v4();

wss.on('connection', (ws:WebSocket)=>{
    const client : Client = new Client(ws, appStateManager, serverId);

    ws.on('message', function incoming(messageData:WebSocket.Data) {
        console.log('received from ' + client.uid + ': %s', messageData);

        let message: any;
        try {
            message = JSON.parse(messageData.toString());
        } catch(e) {
            console.log('Invalid message', e);
            ws.terminate();
            return;
        }

        if (message.type === "api") {
            console.log('Got API request');
            var id = message.id;
            if (id === undefined) id = null;

            const globalUid = client.uid + ':' + id;

            const request = new ClientRequest(globalUid, client);

            createTask<any>(undefined, async (task)=> {
                try {
                    const _app:string = message.details._app;
                    if (_app === undefined || ! Object.prototype.hasOwnProperty.call(apiRoot, _app)) {
                        throw new Error("Invalid _app: " + _app);
                    }
                    const appImpl:RequestHandler.APIAppImplementor<any> = (apiRoot as any)[_app];

                    const _func = message.details._func;
                    if (_func === undefined || !Object.prototype.hasOwnProperty.call(appImpl, _func)) {
                        throw new Error("Invalid _func: " + _app + "." + _func);
                    }

                    const funcImpl = appImpl[_func];
                    const ret = await funcImpl(task.cancellation, message.details.payload);
                    request.success(ret);
                } catch(e) {
                    if (e instanceof CancellationToken.CancellationError) {
                        request.onCancel();
                    } else {
                        request.onError(e);
                    }
                }
            });

        } else if (message.type == "startRequest") {
            console.log('Got action message - deprecated');
            var id = message.id;
            if (id === undefined) id = null;

            const globalUid = client.uid + ':' + id;

            const request = new ClientRequest(globalUid, client);


            createTask<any>(undefined, async (task)=> {
                try {
                    if (!message.details) throw "missing details property";
                    var target = message.details.target;
                    if (!Object.prototype.hasOwnProperty.call(context, target)) {
                        throw new Error('invalid target: ' + target);
                    }
                    const targetObj = (context as any)[target];
                    const method = '$api_' + message.details.method;
                    if (!(method in targetObj)) {
                        throw new Error("Method does not exists: " + target + "." + method);
                    }
                    const ret = await targetObj[method](task.cancellation, message.details);
                    request.success(ret);
                } catch(e) {
                    if (e instanceof CancellationToken.CancellationError) {
                        request.onCancel();
                    } else {
                        request.onError(e);
                    }
                }
            });
        }
    });

    ws.on('close', function (code, reason) {
        console.log('Websocket closed : ' + code);
        client.dispose();
    });
});


app.use(cgi('fitsviewer/fitsviewer.cgi',  { nph: true, dupfd: true }));

var port = parseInt(process.env.PORT || '8080');
app.set('port', port);

server.listen(port);

