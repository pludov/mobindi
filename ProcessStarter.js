'use strict';

const child_process = require('child_process');
const Promises = require('./Promises');
const SystemPromises = require('./SystemPromises');
const Obj = require('./Obj.js');
const fs = require('fs');

// Ensure that a process is running.
// Restart as required.
// Configuration expect:
//   autorun
//   path
//   env
class ProcessStarter {
    constructor(exe, configuration) {
        this.exe = exe;
        this.configuration = configuration;
        if (this.configuration.autorun) {
            this.buildLifeCycle().start();
        }
    }


    startExe() {
        return new Promises.Immediate(() => {
            console.log('Starting ' + this.exe);
            var env = process.env;
            env = Object.assign({}, env);
            env = Object.assign(env, this.configuration.env);

            var exe = this.exe;
            if (this.configuration.path !== null) {
                exe = this.configuration.path + "/" + exe;
            }
            var child = child_process.spawn(exe, [], {
                env: env,
                detached: true,
                stdin: "ignore",
                stderr: "ignore",
                stdout: "ignore"
            });
            child.on('error', (err)=> {
                console.warn("Process " + this.exe + " error : " + err);
            });
        })
    }

    buildLifeCycle() {
        var result = new Promises.Loop(
            new Promises.Chain(
                new SystemPromises.PidOf(this.exe),
                new Promises.Conditional(
                    (o)=>(!o),
                    new Promises.Chain(
                        this.startExe()
                    )
                ),
                new Promises.Sleep(2000)
            )
        );
        return result;
    }
}

module.exports = ProcessStarter;