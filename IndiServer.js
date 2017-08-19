'use strict';

const child_process = require('child_process');
const Promises = require('./Promises');
const SystemPromises = require('./SystemPromises');
const Obj = require('./Obj.js');
const fs = require('fs');

// Ensure that indiserver is running.
// Restart as required.
class IndiServer {
    constructor(wantedConfiguration) {
        // The actual status of indiserver
        this.currentConfiguration = {
            path: null,
            fifopath: null,
            devices: {}
        };

        this.wantedConfiguration = wantedConfiguration;
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

            var fifopath = self.actualFifoPath();

            var env = process.env;
            if (self.currentConfiguration.path != null) {
                env = Object.assign({}, env);
                env['PATH'] = self.currentConfiguration.path + ":" + env['PATH'];
            }

            return new Promises.Chain(
                new SystemPromises.Exec(["rm", "-f", "--", fifopath]),
                new SystemPromises.Exec(["mkfifo", "--", fifopath]),
                new Promises.Immediate(() => {
                    console.log('Starting indiserver');
                    var child = child_process.spawn('indiserver', ['-v', '-f', fifopath], {
                        env: env,
                        detached: true,
                        stderr: "inherit",
                        stdout: "inherit"
                    });
                    child.on('error', (err)=> {
                        console.warn("Process indiserver error : " + err);
                    });
                })// ,
                // Wait for startup. (ouch, ugly)
                // new Promises.Sleep(500)
            );
        });
    }

    actualFifoPath() {
        if (this.currentConfiguration.fifopath === null) {
            return "/tmp/iphdfifo";
        }
        return this.currentConfiguration.fifopath;
    }

    // Return a todo obj, or undefined
    calcToStartStop()
    {
        var self = this;

        function quote(arg)
        {
            // Silly encoding Should check for \n and "
            return '"' + arg + '"';
        }

        function cmdFor(start, devName, details)
        {
            var rslt = start ? "start " : "stop ";
            rslt += details.driver;
            rslt += " -n " + quote(devName);
            if (start) {
                if (details.config) rslt += " -c " + quote(details.config);
                if (details.skeleton) rslt += " -s " + quote(details.skeleton);
                if (details.prefix) rslt += " -p " + quote(details.prefix);
            }
            return rslt;
        }

        function compatible(before, after) {
            // Same dev name. Check driver, params, ...
            return true;
        }

        // Stop what is not required anymore
        for(var running in self.currentConfiguration.devices) {
            if ((!Object.prototype.hasOwnProperty.call(self.wantedConfiguration.devices, running))
                ||(!compatible(self.currentConfiguration[running], self.wantedConfiguration[running])))
            {
                return {
                    cmd: cmdFor(false, running, self.currentConfiguration.devices[running]),
                    done: ()=>{
                        delete self.currentConfiguration.devices[running]; 
                        return 1;
                    }
                }
            }
        }

        // Start new requirements
        for(var wanted in self.wantedConfiguration.devices) {
            if (!Object.prototype.hasOwnProperty.call(self.currentConfiguration.devices, wanted)) {
                var details = Obj.deepCopy(self.wantedConfiguration.devices[wanted]);

                return {
                    cmd: cmdFor(true, wanted, details),
                    done: ()=>{
                        self.currentConfiguration.devices[wanted] = details; 
                        return 1;
                    }
                }
            }
        }

        return undefined;
    }

    // Build a promise that update or ping indiserver
    // The promise generate 0 (was pinged), 1 (was updated), dead: indiserver unreachable
    pushOneDriverChange()
    {
        var self = this;
        return (
            new Promises.Builder((arg)=>
                {
                    var todo = this.calcToStartStop();
                    if (todo === undefined) {
                        // Just ping, then
                        todo = {
                            result: false,
                            cmd: 'ping',
                            done: function() {
                                console.log('Indi server ping ok'); 
                                return 0;
                            }
                        }
                    } else {
                        todo.result = true;
                    }
                    console.log('Indi: fifo order: ' + todo.cmd);
                    var fifopath = self.actualFifoPath();
                    var writeStream = fs.createWriteStream(fifopath);
                    var drained = false;

                    var fileDesc = undefined;
                    function shellEscape(str)
                    {
                        return "'" + str.replace(/'/g, "'\"'\"'") + "'";
                    }

                    return new Promises.Timeout(5000,
                        new Promises.Chain(
                                new SystemPromises.Exec({
                                        command: ["/bin/bash", "-c" , "echo -E " + shellEscape(todo.cmd)  + ' > ' + shellEscape(fifopath)]
                                    }).setCancelable(true),
                                new Promises.Immediate(todo.done)
                        )
                    ).catchTimeout(() => { 
                        console.log('Catched indiserver fifo timeout');
                        self.currentConfiguration.devices = {};
                        return 'dead';
                    });
                }
            )
        );
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
                        self.pushOneDriverChange(),
                        // check indiserver is alive
                        new Promises.Conditional((arg) => ({
                                    perform: arg === 0 || arg === 'dead',
                                    result: arg}),
                            new Promises.Sleep(2000)
                        )
                    ),
                    (o)=>(o === "dead")
                )
            ),
            (o)=>(false)
        );
    }


}

module.exports = IndiServer;