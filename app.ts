'use strict';

import express from 'express';
import http = require('http');
// var path = require('path');
// var favicon = require('serve-favicon');
import logger = require('morgan');
import cookieParser = require('cookie-parser');
import cors = require('cors');
import NEDB = require('nedb');
import sha1 = require('sha1')
import bodyParser = require('body-parser');
import url = require('url');
import WebSocket = require('ws');
import uuid = require('node-uuid');
// Only for debug !
//@ts-ignore
import cgi = require('cgi');
//@ts-ignore
import Client = require('./Client.js');

//@ts-ignore
import {Phd} from './Phd';
//@ts-ignore
import {IndiManager} from './IndiManager';
//@ts-ignore
import {Camera} from './Camera';
//@ts-ignore
import {Focuser} from './Focuser';
//@ts-ignore
import {ImageProcessor} from './ImageProcessor';

//@ts-ignore
import JsonProxy = require('./JsonProxy');
//@ts-ignore
import TriggerExecuter = require('./TriggerExecuter');
//@ts-ignore
import ToolExecuter = require('./ToolExecuter');

import Astrometry from './Astrometry';
// var index = require('./routes/index');
// var users = require('./routes/users');

const app = express();


import session = require('express-session');
import SessionFileStore = require('session-file-store')

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


var appStateManager = new JsonProxy.JsonProxy();
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
    toolExecuter: {
        enabled: true,
        position: 6
    },
    messages: {
        enabled: true,
        position: 7
    }
};


var phd;
var indiManager;
var camera;
var toolExecuter;

var context:any = {
};

context.imageProcessor = new ImageProcessor(appStateManager, context);

context.phd = new Phd(app, appStateManager);

context.indiManager = new IndiManager(app, appStateManager);

context.camera = new Camera(app, appStateManager, context);

context.triggerExecuter = new TriggerExecuter(appStateManager, context);

context.toolExecuter = new ToolExecuter(appStateManager, context);

context.focuser = new Focuser(app, appStateManager, context);

context.astrometry = new Astrometry(app, appStateManager, context);

app.use(function(req, res:any, next) {
    if ('jsonResult' in res) {
        res.status(200);
        res.contentType('application/json');
        // res.header('Cache-Control', 'no-cache');
        res.header("Cache-Control", "no-cache, no-store, must-revalidate");
        res.header("Pragma", "no-cache");
        res.header("Expires", 0);
        console.log('API Returning: ' + JSON.stringify(res.jsonResult));
        res.send(JSON.stringify(res.jsonResult));
    } else {
        next();
    }
});

const server = http.createServer(app);

const wss = new WebSocket.Server({ server: server });

//wss.use(sharedsession(session));

var serverId = uuid.v4();


class Request {
    promise: any;
    cancelRequested: any;
    uid: any;
    client: any;
    finalStatus: any;

    constructor(uid:string, fromClient:any) {
        this.promise = undefined;
        this.cancelRequested = false;
        this.uid = uid;

        this.client = fromClient;
        fromClient.requests.push(this);
        // What was sent when promise terminated
        this.finalStatus = {
            type: 'requestEnd',
            uid: uid,
            status: 'error',
            message: 'internal error'
        };
    }

    // Dettach request from client
    dettach() {
        if (this.client != undefined) {
            var id = this.client.requests.indexOf(this);
            if (id != -1) this.client.requests.splice(id, 1);
            this.client = undefined;
        }
    }

    dispatch(content:any) {
        if (this.client == undefined) {
            return;
        }
        this.client.reply(content);
    }

    onError(err:any) {
        if (err == undefined) {
            err = null;
        } else {
            err = err.stack || '' + err;
        }
        console.log('Request ' + this.uid + ' failure notification: ' + err);
        this.promise = undefined;
        this.finalStatus = {
            type: 'requestEnd',
            uid: this.uid,
            status: 'error',
            message: err
        };
        this.dispatch(this.finalStatus);
        this.dettach();
    }

    success (rslt:any) {
        if (rslt == undefined) rslt = null;
        console.log('Request ' + this.uid + ' succeeded: ' + JSON.stringify(rslt));
        this.promise = undefined;
        this.finalStatus = {
            type: 'requestEnd',
            uid: this.uid,
            status: 'done',
            result: rslt
        };
        this.dispatch(this.finalStatus);
        this.dettach();
    }

    onCancel() {
        console.log('Request ' + this.uid + ' canceled');
        this.promise = undefined;
        this.finalStatus = {
            type: 'requestEnd',
            uid: this.uid,
            status: 'canceled'
        };
        this.dispatch(this.finalStatus);
        this.dettach();
    }
}


wss.on('connection', function connection(ws) {
    var client : any;

    client = new Client(ws);

    ws.on('message', function incoming(message : any) {
        console.log('received from ' + client.uid + ': %s', message);

        try {
            message = JSON.parse(message);
        } catch(e) {
            console.log('Invalid message', e);
            ws.terminate();
            return;
        }

        if (message.type == "startRequest") {
            console.log('Got action message');
            var id = message.id;
            if (id == undefined) id = null;

            var globalUid = client.uid + ':' + id;

            var request = new Request(globalUid, client);


            try {
                if (!message.details) throw "missing details property";
                var target = message.details.target;
                var targetObj = undefined;
                if (Object.prototype.hasOwnProperty.call(context, target)) {
                    targetObj = context[target];
                } else {
                    request.onError('invalid target');
                    return;
                }

                request.promise = targetObj['$api_' + message.details.method](message.details);
                request.promise.then(request.success.bind(request));
                request.promise.onCancel(request.onCancel.bind(request));
                request.promise.onError(request.onError.bind(request));

            } catch(e) {
                request.onError(e);
                return;
            }

            request.promise.start();
        }
    });

    ws.on('close', function (code, reason) {
        console.log('Websocket closed : ' + code);
        client.dispose();
    });

    client.attach(appStateManager, serverId);
});


app.use(cgi('fitsviewer/fitsviewer.cgi',  { nph: true, dupfd: true }));

var port = parseInt(process.env.PORT || '8080');
app.set('port', port);

server.listen(port);

module.exports = app;
