'use strict';

const express = require('express');
const http = require('http');
// var path = require('path');
// var favicon = require('serve-favicon');
const logger = require('morgan');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const NEDB = require('nedb');
const sha1 = require('sha1')
const bodyParser = require('body-parser');
const url = require('url');
const WebSocket = require('ws');
const uuid = require('node-uuid');
// Only for debug !
const cgi = require('cgi');
const Client = require('./Client.js');

const {Phd} = require('./Phd');
const {IndiManager} = require('./IndiManager');
const {Camera} = require('./Camera');

const JsonProxy = require('./JsonProxy');
const TriggerExecuter = require('./TriggerExecuter');
const ToolExecuter = require('./ToolExecuter');
// var index = require('./routes/index');
// var users = require('./routes/users');

const app = express();


var session = require('express-session');
var FileStore = require('session-file-store')(session);

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
    toolExecuter: {
        enabled: true,
        position: 5
    },
    messages: {
        enabled: true,
        position: 6
    }
};


var phd;
var indiManager;
var camera;
var toolExecuter;

var context = {
};

context.phd = new Phd(app, appStateManager);

context.indiManager = new IndiManager(app, appStateManager);

context.camera = new Camera(app, appStateManager, context);

context.triggerExecuter = new TriggerExecuter(appStateManager, context);

context.toolExecuter = new ToolExecuter(appStateManager, context);

app.use(function(req, res, next) {
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
    constructor(uid, fromClient) {
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

    dispatch(content) {
        if (this.client == undefined) {
            return;
        }
        this.client.reply(content);
    }

    onError(err) {
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

    success (rslt) {
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
    var client;

    client = new Client(ws);

    ws.on('message', function incoming(message) {
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
