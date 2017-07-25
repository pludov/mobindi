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

        this.jsonListener = this.jsonListener.bind(this);
    }

    attach(jsonProxy) {
        this.jsonProxy = jsonProxy;
        var initialState = this.jsonProxy.fork();
        this.jsonSerial = initialState.serial;

        this.notify({action: 'welcome', status: "ok", data: initialState.data});
        this.jsonListenerId = this.jsonProxy.addListener(this.jsonListener);
    }

    jsonListener() {
        // FIXME: Si la socket est pleine, abandonne (mais met un timer pour rééssai...)
        var patch = this.jsonProxy.diff(this.jsonSerial);
        this.notify({action: 'update', status: "ok", diff: patch});
    }

    log(message) {
        console.log('Notification channeld ' + this.uid+ ': ' + message);
    }

    dispose() {
        this.log('Disposed');
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
    }

    notify(changeEvent) {
        // Pour l'instant c'est crado
        console.log('Sending notification to '+ this.uid + ': ' + JSON.stringify(changeEvent));
        try {
            this.socket.send(JSON.stringify(changeEvent));
        } catch(e) {
            this.log('Failed to send: ' + e);
            this.dispose();
        }
    }
    reply(data) {
        if (this.socket != undefined) {
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