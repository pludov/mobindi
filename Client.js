'use strict';


var clients = {};
var clientId = 0;


class Client {
    pendingWrites = 0;
    sendingTimer = undefined;
    writes = 0;
    pendingDiffs = 0;

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

    sendDiff() {
        if (this.sendingTimer !== undefined) {
            clearTimeout(this.sendingTimer);
            this.sendingTimer = undefined;
        }
        console.log('Client: sending diff after ' + this.pendingDiffs + ' notifications');
        this.pendingDiffs = 0;
        var patch = this.jsonProxy.diff(this.jsonSerial);
        if (patch !== undefined) {
            this.notify({type: 'update', status: "ok", diff: patch});
        }
    }

    jsonListener() {
        this.pendingDiffs++;
        if (this.sendingTimer === undefined) {
            this.sendingTimer = setTimeout(()=> {
                this.sendingTimer = undefined;
                this.sendDiff();
            }, 40);
        }
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
        console.log('Sending notification to '+ this.uid + ': ' + JSON.stringify(changeEvent, null, 2));
        this.write(changeEvent);
    }

    write(event) {
        try {
            this.socket.send(JSON.stringify(event), (error)=> {
                if (error !== undefined) {
                    this.log('Failed to send: ' + error);
                    this.dispose();
                }
                this.writes--;
            });
        } catch(e) {
            this.log('Failed to send: ' + e);
            this.dispose();
            return;
        }
        this.writes++;
    }

    reply(data) {
        // Ensure client view is up to date
        this.sendDiff();

        if (this.socket != undefined) {
            console.log('Message to ' + this.uid + ':' + JSON.stringify(data));
            this.write(data);
        }
    }
}

module.exports = Client;