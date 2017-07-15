'use strict';


var clients = {};
var clientId = 0;


class Client {

    constructor(socket, session, multiStore)
    {
        this.uid = "#" + (clientId++);
        clients[this.uid] = this;

        this.log('Connected');
        this.socket = socket;
        this.session = session;
        this.multiStore = multiStore;
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
    }

    notify(changeEvent) {
        // Pour l'instant c'est crado
        try {
            this.socket.send(JSON.stringify(changeEvent));
        } catch(e) {
            this.log('Failed to send: ' + e);
            this.dispose();
        }
    }

    static notifyAll(changeEvent) {
        console.log('update notification: ' + JSON.stringify(changeEvent));
        for(var i in clients) {
            clients[i].notify(changeEvent);
        }
    }
}

module.exports = Client;