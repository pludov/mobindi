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
const net = require('net');
const Client = require('./Client.js');

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


var phd;
var statusId = 0;
function updateStatus()
{
    statusId++;
    if (phd == undefined) {
        return;
    }
    Client.notifyAll({
        action: 'update',
        statusId: statusId,
        phd: phd.currentStatus
    });
}

class Phd {


    constructor(app)
    {
        this.running = true;
        this.currentStatus = {
            // Connecting
            phd_started: false,

            connected: false,

            AppState: {
                State: "Stopped"
            }
        };

        app.get('/phd/status', this.getStatus.bind(this));
        app.get('/phd/guide', this.guide.bind(this));
        updateStatus();
        this.startClient();
    }

    startClient() {
        var self = this;


        this.clientData = "";
        this.client = new net.Socket();

        this.client.on('data', function(data) {
            console.log('Received: ' + data);
            self.clientData += data;
            self.flushClientData();
        });

        this.client.on('close', function() {
            self.client = undefined;
            self.flushClientData();

            if (self.running) {
                console.log('Restarting connection to phd');
                self.startClient();
            }
        });

        this.client.connect(4400, '127.0.0.1', function() {
            console.log('Connected to phd');
        });
    }

    flushClientData()
    {
        var self = this;
        // FIXME: consume datas.
        var cutAt;
        while((cutAt = this.clientData.indexOf("\r\n")) != -1)
        {
            var data = this.clientData.substr(0, cutAt);
            this.clientData = this.clientData.substr(cutAt + 2);
            console.log('received json : ' + data);
            try {
                var event = JSON.parse(data);

                if ("Event" in event) {
                    var eventToStatus = {
                        "GuideStep":                "Guiding",
                        "Paused":                   "Paused",
                        "StartCalibration":         "Calibrating",
                        "LoopingExposures":         "Looping",
                        "LoopingExposuresStopped":  "Stopped",
                        "StarLost":                 "LostLock"
                    };
                    switch (event.Event) {
                        case "AppState":
                            self.currentStatus.connected = true;
                            self.currentStatus.AppState = event.State;
                            console.log('Initial status:' + self.currentStatus.AppState);
                            updateStatus();
                            break;
                        default:
                            if (event.Event in eventToStatus) {
                                self.currentStatus.AppState = eventToStatus[event.Event];
                                console.log('New status:' + self.currentStatus.AppState);
                                updateStatus();
                            }
                    };

                }
            }catch(e) {
                console.log('Error: ' + e);
            }
        }
    }

    getStatus(req, res, next)
    {
        res.jsonResult = this.currentStatus;
        next();
    }

    reqGuide(order, next) {
        if (this.client == undefined) {

        }
    }

    whenConnected(data, reply, func) {
        if (this.client == undefined) {
            reply({result: 'ko', detail: 'not ready'});
        } else {
            return this.sendOrder(function() {
                return ({
                    method: "set_connected",
                    params: [ true ]
                });
            })(data, function(result) {
                if (result.result == 'ok') {
                    func(data, reply);
                } else {
                    reply(result);
                }
            });
        }
    }

    sendOrder(func) {
        var self = this;
        return function(data, reply) {
            var order = func(data, reply);

            try {
                self.client.write(JSON.stringify(order) + "\r\n");
                reply({result: 'ok'});
            } catch(e) {
                console.log('Error ' + e);
                reply({result: 'failed', detail: 'error: ' + e});
            }
        };
    }

    startGuide(data, reply) {
        this.whenConnected(data, reply, this.sendOrder(function() {
            return ({
                method: "guide",
                params: [
                    {"pixels": 1.5, "time": 10, "timeout": 60},
                    false
                ],
                id: 9334
            });
        }));
    }

    stopGuide(data, reply) {
        this.whenConnected(data, reply, this.sendOrder(function() {
            return ({
                method: 'stop_capture',
                id: 9333
            });
        }));
    }

    guide(req, res, next) {
        var self = this;
        if (this.client == undefined) {
            res.jsonResult = { status: 'error'};
            next();
        } else {
            var order = {
                method: "guide",
                params:[
                    {"pixels": 1.5, "time": 10, "timeout": 60},
                    false
                ],
                id: 9334
            };
            this.client.write( JSON.stringify(order) + "\r\n");
            res.jsonResult = { status: 'ok'};
            next();
        }
    }


}


phd = new Phd(app);

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

wss.on('connection', function connection(ws) {
    var client;

    client = new Client(ws);

    ws.send(JSON.stringify({action: 'welcome', status:"ok", phd: phd.currentStatus}));

    ws.on('message', function incoming(message) {
        if (!client) {
            ws.terminate();
            return;
        }

        console.log('received: %s', message);

        try {
            message = JSON.parse(message);
        } catch(e) {
            console.log('Invalid message', e);
            ws.terminate();
            return;
        }

        if ('method' in message) {
            console.log('Got action message');
            var target = message.target;
            var targetObj = undefined;

            var reply = function(r) {
                console.log('replying with ' + JSON.stringify(r));
                client.reply(r);
            };

            switch(target) {
                case 'phd':
                    targetObj= phd;
                    break;
                default:
                    reply({status: 'ko', details: 'invalid target'});
                    return;
            }

            try {
                targetObj[message.method](message, reply);
            } catch(e) {
                reply({status: 'ko', details: 'error: ' + e});
            }
        }
    });

    ws.on('close', function (code, reason) {
        if (client) {
            console.log('Websocket closed : ' + code);
            client.dispose();
        } else {
            console.log('Websocket closed (anonymous) : ' + code);
        }
    });
});

var port = parseInt(process.env.PORT || '8080');
app.set('port', port);

server.listen(port);

module.exports = app;
