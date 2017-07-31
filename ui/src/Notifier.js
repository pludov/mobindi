// Detecter l'état de visibilité de la page
import { BackendStatus } from './Store';
const Promises = require('./shared/Promises');


class Request {

    constructor(notifier, requestData, requestId, next) {
        this.notifier = notifier;

        this.requestData = requestData;
        this.requestId = requestId;

        // Callback for done, onError, onCancel...
        this.next = next;

        // Set when first send
        this.uid = undefined;

        // cancel was called on client side ?
        this.canceled = false;
    }

    setClientId(clientId) {
        this.uid = clientId + ':' + this.requestId;
    }

    wasSent() {
        return this.uid != undefined;
    }
}

class Notifier {

    constructor() {
        this.socket = undefined;
        this.connectionId = 0;
        this.sendingQueueMaxSize = 1000;
        this.resetHandshakeStatus(false);

        this.suspended = true;
        this.url = undefined;

        // Request to server are emited with this id
        this.uniqRequestId = 0;

        // The server send that id on each connection.
        // Request are sent using uid: clientId:uniqRequestId
        this.clientId = undefined;


        // Received on welcome. Used to detect server restarts.
        this.serverId = undefined;

        // uniqRequestId => Request objects
        this.toSendRequests = [];
        this.toCancelRequests = [];
        this.activeRequests = {};

        this.resendTimer = undefined;

        if (typeof document.hidden !== "undefined") { // Opera 12.10 and Firefox 18 and later support
            this.hidden = "hidden";
            this.visibilityChange = "visibilitychange";
        } else if (typeof document.msHidden !== "undefined") {
            this.hidden = "msHidden";
            this.visibilityChange = "msvisibilitychange";
        } else if (typeof document.webkitHidden !== "undefined") {
            this.hidden = "webkitHidden";
            this.visibilityChange = "webkitvisibilitychange";
        }
        console.log('hidden property: ' + this.hidden);
        document.addEventListener(this.visibilityChange, this.handleVisibilityChange.bind(this), false);
    }

    attachToStore(store) {
        console.log('Websocket: attached to store');
        this.store = store;
        this.dispatchBackendStatus();
    }

    dispatchBackendStatus(error)
    {
        if (this.store == undefined) return;

        if (error != undefined) {
            this.store.dispatch({type: "backendStatus", backendStatus: BackendStatus.Failed, error: error});
            return;
        }
        if (this.handshakeOk) {
            this.store.dispatch({type: "backendStatus", backendStatus: BackendStatus.Connected, error: null});
            return;
        }
        if (this.socket == null) {
            // On est caché: on est en pause
            if (document[this.hidden]) {
                this.store.dispatch({type: "backendStatus", backendStatus: BackendStatus.Paused, error: null});
                return;
            }
            // On devrait etre connecté
            this.store.dispatch({type: "backendStatus", backendStatus: BackendStatus.Failed});
            return;
        } else {
            this.store.dispatch({type: "backendStatus", backendStatus: BackendStatus.Connecting, error: null});
        }

    }

    resetHandshakeStatus(status, clientId)
    {
        this.handshakeOk = status;
        this.pendingUpdateAsk = {};
        this.pendingMessageCount = 0;
        if (status) {
            this.connectionId++;
            this.clientId = clientId;
        }
        this.clearXmitTimeout();
    }

    sendingQueueReady() {
        return this.handshakeOk &&
            this.socket.bufferedAmount < this.sendingQueueMaxSize;
    }

    sendAsap() {
        var self = this;

        if (this.resendTimer != undefined) {
            window.clearTimeout(this.resendTimer);
            this.resendTimer = undefined;
        }

        var sthSent = false;
        while((this.toSendRequests.length || this.toCancelRequests.length) && this.sendingQueueReady()) {
            sthSent = true;
            if (this.toCancelRequests.length) {
                var toCancel = this.toCancelRequests.splice(0, 1)[0];
                this.write({
                    'type': 'cancelRequest',
                    'uid': toCancel.uid
                });
            } else {
                var toSend = this.toSendRequests.splice(0, 1)[0];
                toSend.setClientId(this.clientId);
                this.activeRequests[toSend.uid] = toSend;
                this.write({
                    'type': 'startRequest',
                    id: toSend.requestId,
                    details: toSend.requestData
                });
            }
        }
        // Add a timer to restart asap
        // FIXME: would prefer a notification from websocket !
        if (this.toSendRequests.length || this.toCancelRequests.length) {
            this.resendTimer = window.setTimeout(function() {
                this.resendTimer = undefined;
                self.sendAsap();
            }, 100);
        }
   }


    // Returns a promise that will execute the request
    // Except an object with at least target and method property set
    // will call a $api_ method on server side
    sendRequest(content) {
        var self = this;
        // FIXME: make cancelable
        // FIXME: accept progress report
        return new Promises.Cancelable((next, arg) => {
            var effectiveContent = Object.assign({}, content);
            var request = new Request(self, effectiveContent, self.uniqRequestId++, next);
            self.toSendRequests.push(request);
            self.sendAsap();
        });
    }

    // Called on reconnection when backend was restarted.
    // abort all pending requests
    failStartedRequests(error) {
        var toDrop = Object.keys(this.activeRequests);
        for(var i = 0; i < toDrop.length; ++i) {
            var uid = toDrop[i];
            if (!Object.prototype.hasOwnProperty.call(this.activeRequests, uid)) continue;
            var request = this.activeRequests[uid];
            delete this.activeRequests[uid];

            for(var j = 0 ; j < this.toCancelRequests;) {
                if (this.toCancelRequests[j] === request) {
                    this.toCancelRequests.splice(j, 1);
                } else {
                    j++;
                }
            }

            try {
                request.next.onError(error);
            } catch(e) {
                console.error('onCancel error', e.stack || e);
            }
        }
    }

    // When connection restarts, query the status of the running requests.
    askRequestStatus() {
        // FIXME: send a message with all known request and expect a result from server
        // server must also add this client to list of clients listening for the requests
    }

    write(obj)
    {
        try {
            this.socket.send(JSON.stringify(obj));
        } catch(e) {
            console.log('Websocket: write failed: ' + e);
            this._close();
            this.dispatchBackendStatus();
        }
    }

    clearXmitTimeout() {
        if (this.xmitTimeout != undefined) {
            window.clearTimeout(this.xmitTimeout);
            this.xmitTimeout = undefined;
        }
    }

    cancelHidingTimeout() {
        if (this.hidingTimeout != undefined) {
            window.clearTimeout(this.hidingTimeout);
            this.hidingTimeout = undefined;
        }
    }

    handleVisibilityChange() {
        if (document[this.hidden]) {
            console.log('Websocket: Became hidden');
            this.cancelHidingTimeout();
            var self = this;
            this.hidingTimeout = window.setTimeout(function() {
                console.log('Websocket: Hiding timeout expired');
                self.hidingTimout = undefined;
                self.updateState();
            }, 10000);
        } else {
            console.log('Websocket: Became visible');
            this.cancelHidingTimeout();
            this.updateState();
        }
    }

    connect(apiRoot) {
        var webSocketRoot = apiRoot + "notifications";
        webSocketRoot = "ws" + webSocketRoot.substr(4);
        this.url = webSocketRoot;

        this.updateState();
    }

    updateState()
    {
        var wantedConn = !document[this.hidden];
        if (wantedConn) {
            if (!this.socket) {
                // FIXME: delay ?
                console.log('Websocket: restart needed');
                this._open();
            }
        } else {
            if (this.socket) {
                console.log('Websocket: close required');
                this._close();
                this.dispatchBackendStatus();
            }
        }
    }

    _open() {
        var self = this;
        console.log('Websocket: connecting to ' + this.url);
        this.resetHandshakeStatus(false);
        try {
            this.socket = new WebSocket(this.url);
            this.dispatchBackendStatus();
        } catch(e) {
            console.log('Websocket: failed to open: ' + e);
            this.socket = undefined;
            this.dispatchBackendStatus('' + e);
        }
        if (this.socket) {
            this.socket.onopen = function(data) {
                console.log('Websocket: connected');
            };
            this.socket.onmessage = function(event) {
                console.log('Websocket: received : ' + JSON.stringify(event.data, null, 2));
                var data = JSON.parse(event.data);
                if (data.type == 'welcome') {
                    console.log('Websocket: welcomed');
                    self.resetHandshakeStatus(true, data.clientId);
                    var previousServerId = self.ServerId;
                    self.serverId = data.serverId;

                    self.store.dispatch({type: 'notification', data: data.data});
                    if (self.serverId != previousServerId && previousServerId != undefined) {
                        self.failStartedRequests("Backend was restarted");
                    } else {
                        // Demander l'état de toutes les requetes connues
                        // Celles qui sont inconnues sont soient oubliées, soit pas reçue
                        // On ne veut pas les relancer !
                        self.askRequestStatus();
                    }
                }

                // FIXME: handle requestProgress (cf app.js)

                if (data.type == 'requestEnd') {
                    var uid = data.uid;
                    if (Object.prototype.hasOwnProperty.call(self.activeRequests, uid)) {
                        var request = self.activeRequests[uid];
                        delete(self.activeRequests[uid]);
                        self.toCancelRequests = self.toCancelRequests.filter((item)=>{item.uid != uid});
                        console.log('Request status is ' + data.status);
                        switch(data.status) {
                            case 'done':
                                request.next.done(data.result);
                                break;
                            case 'canceled':
                                request.next.onCancel();
                                break;
                            default:
                                request.next.onError(data.message);
                                break;
                        }

                    } else {
                        console.log('Request not found: ' + uid);
                    }
                }

                if (data.type=="update") {
                    self.store.dispatch({type: "notification", diff: data.diff});
                }

            };
            this.socket.onclose = function(data) {
                console.log('Websocket: closed');
                self.socket = undefined;
                self.resetHandshakeStatus(false);
                self.dispatchBackendStatus();
                window.setTimeout(function() {
                    self.updateState();
                }, 2000);
            };
            this.socket.onerror = function(error) {
                console.log('Websocket: error: ' + JSON.stringify(error));
                self._close();
                self.dispatchBackendStatus('Connection aborted');
                window.setTimeout(function() {
                    self.updateState();
                }, 2000);
            };

        }
    }

    _close() {
        if (this.socket == undefined) return;

        console.log('Websocket: disconnecting');
        try {
            this.socket.close();
        } catch(e) {
            console.log('Websocket Failed to close: ' + e);
        }
        this.resetHandshakeStatus(false);
        this.socket = undefined;
    }
}

export default Notifier