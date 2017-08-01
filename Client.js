'use strict';


var clients = {};
var clientId = 0;


class Client {

    constructor(socket)
    {
        this.uid = "#" + (clientId++);
        clients[this.uid] = this;

        this.log('Client ' + this.uid + ' connected');
        this.socket = socket;
        this.disposed = false;
        this.requests = [];
        this.jsonListener = this.jsonListener.bind(this);
    }

    attach(jsonProxy, serverId) {
        this.jsonProxy = jsonProxy;
        var initialState = this.jsonProxy.fork();
        this.jsonSerial = initialState.serial;

        this.notify({type: 'welcome', status: "ok", serverId: serverId, clientId: this.uid, data: initialState.data});
        this.jsonListenerId = this.jsonProxy.addListener(this.jsonListener);
    }

    jsonListener() {
        // FIXME: Si la socket est pleine, abandonne (mais met un timer pour rééssai...)
        var patch = this.jsonProxy.diff(this.jsonSerial);
        this.notify({type: 'update', status: "ok", diff: patch});
    }

    log(message) {
        console.log('Notification channeld ' + this.uid+ ': ' + message);
    }

    dispose() {
        this.log('Disposed');
        this.disposed = true;
        if (this.socket != undefined) {
            try {
                this.socket.close();
            } catch(e) {
                this.log('Failed to close: ' + e);
            }
            this.socket = undefined;
        }
        delete clients[this.uid];
        this.jsonProxy.removeListener(this.jsonListenerId);
        while(this.requests.length) {
            this.requests[0].dettach();
        }
    }

    notify(changeEvent) {
        // Pour l'instant c'est crado
        console.log('Sending notification to '+ this.uid + ': ' + JSON.stringify(changeEvent, null, 2));
        try {
            this.socket.send(JSON.stringify(changeEvent));
        } catch(e) {
            this.log('Failed to send: ' + e);
            this.dispose();
        }
    }
    reply(data) {
        if (this.socket != undefined) {
            console.log('Message to ' + this.uid + ':' + JSON.stringify(data));
            try {
                this.socket.send(JSON.stringify(data));
            } catch(e) {
                this.log('Failed to send: ' + e);
                this.dispose();
            }
        }
    }
}

module.exports = Client;