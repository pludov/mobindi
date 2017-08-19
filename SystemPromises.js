'use strict';

const TraceError = require('trace-error');
const child_process = require('child_process');
const Promises = require('./Promises');


class Exec extends Promises.Cancelable {
    constructor(cmd) {
        var self;
        super(function(next, arg){
            var cmdDesc = Promises.dynValue(cmd, arg);
            var cmdArr = [], opts = {
                stdio: 'inherit', 
                stderr: 'inherit'
            };
            if (Array.isArray(cmdDesc)) {
                cmdArr = cmdDesc;
            } else {
                cmdArr = cmdDesc.command;
                opts = Object.assign(opts, cmdDesc.options);
            }
            
            var supportCancel = Promises.dynValue(self.cancelable, arg);

            var child = child_process.spawn(cmdArr[0], cmdArr.slice(1), opts);
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

module.exports = {Exec};