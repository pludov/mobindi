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

const Client = require('./Client.js');

// var index = require('./routes/index');
// var users = require('./routes/users');

const app = express();


var auth = new NEDB({filename: 'data/users.db', autoload: true});

var session = require('express-session');
var FileStore = require('session-file-store')(session);


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

app.post('/auth', (req, res, next) => {
    // Creer une session
    auth.findOne({
        login: req.body.login,
        password: sha1(req.body.login + "#" + req.body.password)
    },
    function(err, doc) {
        if (doc != null) {
            console.log('Authenticated: ' + req.body.login);
            req.session.user = req.body.login;
        }
        res.status(200);
        res.contentType('application/json');
        res.header('Cache-Control', 'no-cache');

        var rslt = {
            success: doc != null
        };

        console.log('Auth returning: ' + JSON.stringify(rslt));
        res.send(JSON.stringify(rslt));
    });
});

// FIXME: a partir de là, sauf sur auth, il faut une session valide
app.use((req, res, next) => {
    var sess = req.session;
    if (!sess.user) {
        res.status(403);
        res.header('Cache-Control', 'no-cache');
        res.send("Unauthorized");
        return;
    }
    next();
});


class Store{
    constructor(id, db)
    {
        this.id = id;
        this.db = db;
    }

    list(req, res, next) {
        var self = this;

        if (!('pattern' in req.query)) {
            next();
            return;
        }

        var pattern = req.query.pattern;
        if (pattern == undefined ) {
            pattern = "";
        }

        pattern = pattern.trim();

        // https://developer.mozilla.org/en/docs/Web/JavaScript/Guide/Regular_Expressions#Using_Special_Characters
        function escapeRegexCharacters(str) {
            return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }

        const filter = pattern.trim();
        const escapedValue = escapeRegexCharacters(filter);

        const regex = new RegExp('\\b' + escapedValue, 'i');

        this.db.find({title: regex}).sort({title: 1}).exec(function(err, docs) {
            if (err != null) {console.log('Find error: ' + err)};
            res.jsonResult = docs;
            next();
        });
    }

    add(req, res, next) {
        var self = this;

        console.log('Adding: ' + JSON.stringify(req.body));
        var newObject = Object.assign({}, req.body, {rev: 0});
        delete newObject["_id"];

        this.db.insert(newObject, function (err, newDoc) {
            // FIXME: faire suivre les erreurs !
            if (err) {
                next("error:" + err);
                return;
            }else if (newDoc != null) {
                Client.notifyAll({
                    store: self.id,
                    action: 'add',
                    _id: newDoc._id,
                    data: newDoc
                });
                res.jsonResult = newDoc;
            }
            next();
        });
    }

    update(req, res, next) {
        var self = this;

        console.log('Updating: ' + JSON.stringify(req.body));
        var update = {
            $inc: {rev: 1},
            $set: {},
            $unset: {}
        };

        for(var key in req.body) {
            var val = req.body[key];
            if (val == null) {
                update.$unset[key] = true;
            } else {
                update.$set[key] = val;
            }
        }
        console.log('updating with: ' + JSON.stringify(update));
        this.db.update({ _id: req.params.uid}, update, {
                returnUpdatedDocs:true,
                multi:false
            },
            function(err, nbAffected, doc) {
                if (err) {
                    next("error:" + err);
                } else if (nbAffected == 0) {
                    next("not found");
                } else {
                    console.log('update result: ' + JSON.stringify(doc));
                    Client.notifyAll({
                        store: self.id,
                        action: 'update',
                        _id: req.params.uid,
                        data: doc
                    });
                    res.jsonResult = doc;
                    next();
                }
            });
    }

    delete(req, res, next) {
        var self = this;

        console.log('Dropping: ' + JSON.stringify(req.param.uid));
        this.db.remove({ _id: req.params.uid}, {
                returnUpdatedDocs:true,
                multi:false
            },
            function(err, nbAffected) {
                if (err) {
                    next("error:" + err);
                } else if (nbAffected == 0) {
                    next("not found");
                } else {
                    console.log('delete ok');

                    Client.notifyAll({
                        store: self.id,
                        action: 'delete',
                        _id: req.params.uid
                    });

                    res.jsonResult = {};
                    next();
                }
            });
    }

    get(req, res, next) {
        var self = this;

        this.db.findOne({ _id: req.params.uid }, function(err, doc) {
            res.jsonResult = doc;
            next();
        });
    }
}

class Multistore {

    constructor(app) {
        this.stores = {};

        app.get('/store/:storeId', this.forward('list'));

        app.post('/store/:storeId', this.forward('add'));

        app.post('/store/:storeId/:uid', this.forward('update'));

        app.delete('/store/:storeId/:uid', this.forward('delete'));

        app.get('/store/:storeId/:uid', this.forward('get'));
    }

    forward(method) {
        return (req, res, next) => {
            console.log('handling: ' + JSON.stringify(req.params));
            var storeId = req.params.storeId;

            // FIXME: secu ici ? (appel à une méthode sur un objet ?)
            var store = this.stores[storeId];
            if (store == undefined) {
                console.log('Store not found: ' + storeId);
                res.status(404);
                res.send('store not found');
                return;
            }
            return store[method](req, res, next);
        }
    }

    addStore(store) {
        this.stores[store.id] = store;
    }
};

const multiStore = new Multistore(app);
multiStore.addStore(new Store('items', new NEDB({filename: 'data/db.db', autoload: true })));

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

const wss = new WebSocket.Server({ server });

//wss.use(sharedsession(session));

wss.on('connection', function connection(ws) {
    console.log('Websocket connection at ' + ws.upgradeReq.url);

    var client;

    sessionParser(ws.upgradeReq, {}, function(req) {
        if (!ws.upgradeReq.session.user) {
            console.log('Websocket rejected unauthorized access.');
            ws.send(JSON.stringify({status:"unauthentified"}), function() {
                ws.close();
            });
        } else {
            var session = ws.upgradeReq.session;
            console.log('Websocket authenticated for ' + session.user);
            client = new Client(ws, session, multiStore);
            ws.send(JSON.stringify({action: 'welcome', status:"ok"}));
        }
    });


    ws.on('message', function incoming(message) {
        if (!client) {
            ws.terminate();
            return;
        }
        console.log('received: %s', message);
    });

    ws.on('close', function (code, reason) {
        if (client) {
            console.log('Websocket closed for ' + client.session.user + ' : ' + code);
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
