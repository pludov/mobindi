'use strict';

const TraceError = require('trace-error');
const child_process = require('child_process');
const Promises = require('./Promises');


// Return true if the given process exists
class PidOf extends Promises.Cancelable {
    constructor(exe) {
        super((next)=>{
            var ps = child_process.spawn("pidof", [Promises.dynValue(exe)], {stdio: [process.stdin, process.stdout, process.stderr]});
            ps.on('error', (err)=> {
                console.warn("Process pidof error : ", err);
            });
            ps.on('exit', (code, signal) => {
                if (code === 0 || code === 1) {
                    next.done(code === 0);
                } else {
                    next.error("Failed to run pidof");
                }
            });
        });

    }
}

class Exec extends Promises.Cancelable {
    constructor(cmd) {
        var self;
        super(function(next, arg){
            var cmdDesc = Promises.dynValue(cmd, arg);
            var cmdArr = [], opts = {
                stdio: [process.stdin, process.stdout, process.stderr]
            };
            if (Array.isArray(cmdDesc)) {
                cmdArr = cmdDesc;
            } else {
                cmdArr = cmdDesc.command;
                opts = Object.assign(opts, cmdDesc.options);
            }
            
            var supportCancel = Promises.dynValue(self.cancelable, arg);

            var child = child_process.spawn(cmdArr[0], cmdArr.slice(1), opts);
            if (opts.stdin) {
                opts.stdin.pipe(child.stdin);
            }
            if (opts.stdout) {
                child.stdout.pipe(opts.stdout);
            }
            if (opts.stderr) {
                child.stderr.pipe(opts.stderr);
            }
            
            child.on('error', (err)=> {
                console.warn("Process " + cmdArr[0] + " error : " + err);
            });
            child.on('exit', (ret, signal) => {
                if (ret === 0) {
                    next.done(true);
                } else {
                    if (supportCancel && next.cancelationPending()) {
                        next.cancel();
                    } else {
                        next.error('Wrong result code for ' + JSON.stringify(cmdArr));
                    }
                }
            });
            
            if (supportCancel) {
                next.setCancelFunc(() => {
                    child.kill();
                });
            }
        });

        self = this;
        this.cancelable = false;
    }

    setCancelable(value)
    {
        this.cancelable = value;
        return this;
    }

}

module.exports = {Exec, PidOf};