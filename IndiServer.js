'use strict';

const child_process = require('child_process');
const Promises = require('./Promises');
const Obj = require('./Obj.js');

// Ensure that indiserver is running.
// Restart as required.
class IndiServer {
    constructor() {
        // The actual status of indiserver
        this.currentConfiguration = {
            path: null,
            fifopath: null,
            devices: {}
        };

        this.wantedConfiguration = {
            path: '/opt/bin',
            fifopath: null,
            devices: {}
        };
    }

    // Return a promises that check if a valid indiserver process exists
    findIndiServer(resetConf) {
        var self = this;
        return new Promises.Cancelable((next)=>{
            var ps = child_process.spawn("pidof", ["indiserver"]);
            ps.on('error', (err)=> {
                console.warn("Process pidof error : " + err);
            });
            ps.on('exit', (code, signal) => {
                if (code === 0 || code === 1) {
                    if (resetConf) {
                        if (code === 0) {
                            this.currentConfiguration = Obj.deepCopy(self.wantedConfiguration);
                            console.log('Indiserver process found. Assuming it already has the right configuration.');
                        } else {
                            console.log('Indiserver process not found.');
                        }
                    }
                    next.done(code === 0);
                } else {
                    next.error("Failed to run pidof");
                }
            });
        });
    }

    startIndiServer() {
        var self = this;
        return new Promises.Builder(() => {
            //console.log('Starting indiserver for configuration: ' + JSON.stringify(self.currentConfiguration, null, 2));
            self.currentConfiguration.fifopath = self.wantedConfiguration.fifopath;
            self.currentConfiguration.path = self.wantedConfiguration.path;

            var fifopath = self.currentConfiguration.fifopath;
            if (fifopath == null) {
                fifopath = "/tmp/iphdfifo";
            }

            var env = process.env;
            if (self.currentConfiguration.path != null) {
                env = Object.assign({}, env);
                env['PATH'] = self.currentConfiguration.path + ":" + env['PATH'];
            }

            return new Promises.Chain(
                new Promises.Exec(["rm", "-f", "--", fifopath]),
                new Promises.Exec(["mkfifo", "--", fifopath]),
                new Promises.Immediate(() => {
                    console.log('Starting indiserver');
                    var child = child_process.spawn('indiserver', ['-v', '-f', fifopath], {
                        env: env,
                        detached: true
                    });
                    child.on('error', (err)=> {
                        console.warn("Process indiserver error : " + err);
                    });
                })
            );
        });
    }

    // Start the lifecycle
    // check if indiserver is running. If so, assume that the drivers are all started
    // otherwise, 
    buildLifeCycle() {
        var self = this;
        return new Promises.Loop(
            new Promises.Chain(
                self.findIndiServer(true),
                new Promises.Conditional(
                    (o)=>(!o),
                    new Promises.Chain(
                        self.startIndiServer()
                    )
                ),
                new Promises.Loop(
                    // Compare conf, wait for conf change, timeout at 10
                    new Promises.Chain(
                        // wait for configuation change (with timeout)
                        // self.waitOneDriverChange(10),
                        // self.pushOneDriverChange(),

                        // check indiserver is alive
                        self.findIndiServer(false)
                    ),
                    (o)=>(!o)
                )
            ),
            (o)=>(false)
        );
    }


}

module.exports = IndiServer;