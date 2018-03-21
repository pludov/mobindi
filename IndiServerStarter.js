'use strict';

const child_process = require('child_process');
const Promises = require('./Promises');
const SystemPromises = require('./SystemPromises');
const Obj = require('./Obj.js');
const fs = require('fs');

// Ensure that indiserver is running.
// Restart as required.
class IndiServerStarter {
    constructor(wantedConfiguration) {
        // The actual status of indiserver
        this.currentConfiguration = {
            path: null,
            fifopath: null,
            devices: {},
            restartList: []
        };

        this.wantedConfiguration = wantedConfiguration;

        if (this.wantedConfiguration.autorun) this.buildLifeCycle().start();
    }

    // Return a promises that check if a valid indiserver process exists
    findIndiServer(resetConf) {
        var self = this;
        return new Promises.Chain(
            new SystemPromises.PidOf('indiserver'),
            new Promises.Immediate((arg)=>{
                if (resetConf) {
                    if (arg) {
                        self.currentConfiguration = Obj.deepCopy(self.wantedConfiguration);
                        console.log('Indiserver process found. Assuming it already has the right configuration.');
                    } else {
                        console.log('Indiserver process not found.');
                    }
                };
                self.currentConfiguration.restartList = [];
                return arg;
            })
        );
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
                        stdio: 'ignore'
                    });
                    child.on('error', (err)=> {
                        console.warn("Process indiserver error : " + err);
                    });
                })
            );
        });
    }

    restartDevice(dev)
    {
        if (this.currentConfiguration.restartList.indexOf(dev) != -1) {
            return;
        }
        this.currentConfiguration.restartList.push(dev);

    }

    actualFifoPath() {
        if (this.currentConfiguration.fifopath === null) {
            return "/tmp/indiserverfifo";
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
            var restartId = self.currentConfiguration.restartList.indexOf(running);
            if ((!Object.prototype.hasOwnProperty.call(self.wantedConfiguration.devices, running))
                ||(!compatible(self.currentConfiguration[running], self.wantedConfiguration[running]))
                ||(restartId != - 1))
            {
                if (restartId != -1) {
                    self.currentConfiguration.restartList.splice(restartId, 1);
                }

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
                                return 0;
                            }
                        }
                    } else {
                        console.log('Indi: fifo order: ' + todo.cmd);
                        todo.result = true;
                    }
                    var fifopath = self.actualFifoPath();

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
        function atend()
        {
            if (self.currentLifeCycle == result) {
                if (self.wantedConfiguration.autorun) {
                    self.currentLifeCycle.start();
                } else {
                    self.currentLifeCycle = undefined;
                }
            }
        }
        var result = new Promises.Loop(
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
                                    perform: (arg === 0 || arg === 'dead') && self.wantedConfiguration.autorun,
                                    result: arg}),
                            // FIXME: make this sleep interruptible
                            new Promises.Sleep(2000)
                        )
                    ),
                    (o)=>(o === "dead" || !self.wantedConfiguration.autorun)
                )
            ),
            (o)=>(!self.wantedConfiguration.autorun)
        ).then(atend).onError((e) =>  { console.log('error:' + e); atend(); }).onCancel(atend);
        this.currentLifeCycle = result;
        return result;
    }


}

module.exports = IndiServerStarter;