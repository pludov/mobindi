/**
 * Created by ludovic on 21/07/17.
 */

'use strict';

const {IndiConnection} = require('./Indi');
const Promises = require('./Promises');

function has(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
}

function clear(obj) {
    for(var k in obj) {
        if (has(obj, k)) {
            delete(obj[k]);
        }
    }
}

class IndiManager {

    constructor(app, appStateManager) {
        this.appStateManager = appStateManager;
        this.appStateManager.getTarget().indiManager = {
            // connecting, connected, error
            status: "connecting",
            deviceTree: {}
        }

        this.currentStatus = this.appStateManager.getTarget().indiManager;

        this.lifeCycle = this.buildLifeCycle();
        this.lifeCycle.start();
    }

    refreshStatus()
    {
        if (this.connection == undefined) {
            this.currentStatus.status = "error";
            clear(this.currentStatus.deviceTree);

        } else if (!this.connection.connected) {
            this.currentStatus.status = "connecting";
            clear(this.currentStatus.deviceTree);
        } else {
            this.currentStatus.status = "connected";
        }
    }

    buildLifeCycle() {
        const self = this;
        return (
            new Promises.Loop(
                new Promises.Chain(
                    new Promises.Cancelable((next) => {
                        var indiConnection = new IndiConnection();
                        self.connection = indiConnection;
                        self.connection.deviceTree = this.currentStatus.deviceTree;

                        // start
                        var listener = function() {
                            self.refreshStatus();
                        };

                        indiConnection.connect('127.0.0.1');
                        indiConnection.addListener(listener);

                        next.done(indiConnection.wait(()=>{
                            console.log('socket is ' + indiConnection.socket);
                            return indiConnection.socket == undefined;
                        }).then(() => {
                            console.log('Indi connection disconnected');
                            indiConnection.removeListener(listener);
                            if (self.connection == indiConnection) {
                                self.connection = undefined;
                                self.refreshStatus();
                            }
                        }));
                    }),
                    new Promises.ExecutePromise(),
                    new Promises.Sleep(2000)
                )
            )
        );
    }

    setProperty(message, reply)
    {
        // Un truc plus serieux svp...
        var msg = '<newSwitchVector device="' + message.data.dev + '" name="' + message.data.vec+'">';
        for(var o of message.data.children) {
            msg += '<oneSwitch name="' + o.name + '">' + o.value + '</oneSwitch>';
        }
        msg += '</newSwitchVector>';
        this.connection.queueMessage(msg);
    }
}

module.exports = {IndiManager};