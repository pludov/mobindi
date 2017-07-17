// Detecter l'état de visibilité de la page

class Notifier {

    constructor() {
        this.socket = undefined;
        this.connectionId = 0;
        this.sendingQueueMaxSize = 100;
        this.resetHandshakeStatus(false);

        this.suspended = true;
        this.url = undefined;

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
    }

    resetHandshakeStatus(status)
    {
        this.handshakeOk = status;
        this.pendingUpdateAsk = {};
        this.pendingMessageCount = 0;
        if (status) {
            this.connectionId++;
        }
        this.clearXmitTimeout();
    }

    sendingQueueReady() {
        return this.handshakeOk &&
            this.socket.bufferedAmount < this.sendingQueueMaxSize;
    }

    sendMessage(obj)
    {
        try {
            this.socket.send(JSON.stringify(obj));
        } catch(e) {
            console.log('Websocket: write failed: ' + e);
            this._close();
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
        if (this.socket != undefined) {
            try {
                this.socket.send('Websocket: Hidden changed to ' + document[this.hidden]);
            } catch(e) {
                console.log('Websocket: send failed: ' + e);
                this._close();
            }
        }
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
            }
        }
    }

    _open() {
        var self = this;
        console.log('Websocket: connecting to ' + this.url);
        this.resetHandshakeStatus(false);
        try {
            this.socket = new WebSocket(this.url);
        } catch(e) {
            console.log('Websocket: failed to open: ' + e);
            this.socket = undefined;
        }
        if (this.socket) {
            this.socket.onopen = function(data) {
                console.log('Websocket: connected');
            };
            this.socket.onmessage = function(event) {
                console.log('Websocket: received : ' + JSON.stringify(event.data, null, 2));
                var data = JSON.parse(event.data);
                if (data.action == 'welcome') {

                    console.log('Websocket: welcomed');
                    self.resetHandshakeStatus(true);
                }

                if (self.store != undefined) {
                    self.store.dispatch({type: "notification", data: data});
                }

            };
            this.socket.onclose = function(data) {
                console.log('Websocket: closed');
                self.socket = undefined;
                self.resetHandshakeStatus(false);
                window.setTimeout(function() {
                    self.updateState();
                }, 2000);
            };
            this.socket.onerror = function(data) {
                console.log('Websocket: error');
                self._close();
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