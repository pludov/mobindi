/**
 * Created by ludovic on 21/07/17.
 */

'use strict';

const {IndiConnection} = require('./Indi');
const Promises = require('./Promises');

class IndiManager {

    constructor(app, appStateManager) {
        this.appStateManager = appStateManager;
        this.appStateManager.getTarget().indiManager = {
            // connecting, connected, error
            status: "connecting",
        }

        this.currentStatus = this.appStateManager.getTarget().indiManager;

        this.lifeCycle = this.buildLifeCycle();
        this.lifeCycle.start();
    }

    refreshStatus()
    {
        if (this.connection == undefined) {
            this.currentStatus.status = "error";
            this.currentStatus.indiState = {};
        } else if (!this.connection.connected) {
            this.currentStatus.status = "connecting";
            this.currentStatus.indiState = {};
        } else {
            this.currentStatus.status = "connected";
            this.currentStatus.indiState = this.connection.properties;
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
}

module.exports = {IndiManager};