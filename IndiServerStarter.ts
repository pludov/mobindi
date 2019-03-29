import child_process from 'child_process';
import CancellationToken from 'cancellationtoken';
import { IndiServerConfiguration, IndiServerState, IndiDeviceConfiguration } from './shared/BackOfficeStatus';
import * as SystemPromise from './SystemPromise';
import Timeout from './Timeout';
import { Task, createTask } from './Task';
import Sleep from './Sleep';

import * as Obj from './Obj.js';


// Ensure that indiserver is running.
// Restart as required.
export default class IndiServerStarter {
    private currentConfiguration: IndiServerState;
    private wantedConfiguration: IndiServerConfiguration;
    private lifeCycle: Task<void>|null;

    constructor(wantedConfiguration: IndiServerConfiguration) {
        // The actual status of indiserver
        this.currentConfiguration = {
            path: null,
            fifopath: null,
            devices: {},
            autorun: true,
            restartList: [],
        };

        this.wantedConfiguration = wantedConfiguration;

        this.lifeCycle = null;

        if (this.wantedConfiguration.autorun) this.startLifeCycle();
    }

    // check if a valid indiserver process exists
    private findIndiServer= async (ct: CancellationToken, resetConf:boolean)=>{
        const exists = await SystemPromise.PidOf(ct, 'indiserver');
        
        if (resetConf) {
            if (exists) {
                this.currentConfiguration = {
                    ...Obj.deepCopy(this.wantedConfiguration),
                    restartList: [],
                };
                console.log('Indiserver process found. Assuming it already has the right configuration.');
            } else {
                console.log('Indiserver process not found.');
            }
        };
        this.currentConfiguration.restartList = [];
        return exists;
    }

    private startIndiServer=async (ct: CancellationToken)=>{

            //console.log('Starting indiserver for configuration: ' + JSON.stringify(self.currentConfiguration, null, 2));
        this.currentConfiguration.fifopath = this.wantedConfiguration.fifopath;
        this.currentConfiguration.path = this.wantedConfiguration.path;

        const fifopath = this.actualFifoPath();
        if (fifopath === null) {
            throw new Error("Invalid indi fifo path");
        }
        var env = process.env;
        if (this.currentConfiguration.path != null) {
            env = {
                ...env,
                PATH:  this.currentConfiguration.path + ":" + env['PATH']
            };
        }

        if (await SystemPromise.Exec(ct, {command: ["rm", "-f", "--", fifopath]}) !== 0) {
            throw new Error("rm failed");
        }

        if (await SystemPromise.Exec(ct, {command: ["mkfifo", "---", fifopath]}) !== 0) {
            throw new Error("mkfifo failed");
        }

        console.log('Starting indiserver');
        var child = child_process.spawn('indiserver', ['-v', '-f', fifopath], {
                env: env,
                detached: true,
                stdio: 'ignore'
            });
        child.on('error', (err:any)=> {
            console.warn("Process indiserver error : " + err);
        });
    }

    public restartDevice=async (ct:CancellationToken, dev:string)=>
    {
        if (this.currentConfiguration.restartList.indexOf(dev) != -1) {
            return;
        }
        this.currentConfiguration.restartList.push(dev);

    }

    private actualFifoPath=()=>{
        if (this.currentConfiguration.fifopath === null) {
            return "/tmp/indiserverfifo";
        }
        return this.currentConfiguration.fifopath;
    }

    // Return a todo obj, or undefined
    private calcToStartStop=()=>
    {
        function quote(arg: string)
        {
            // Silly encoding Should check for \n and "
            return '"' + arg + '"';
        }

        function cmdFor(start:boolean, devName:string, details:IndiDeviceConfiguration)
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

        function compatible(before:IndiDeviceConfiguration, after:IndiDeviceConfiguration) {
            // Same dev name. Check driver, params, ...
            return true;
        }

        // Stop what is not required anymore
        for(const running of Object.keys(this.currentConfiguration.devices)) {
            const restartId = this.currentConfiguration.restartList.indexOf(running);
            if ((!Object.prototype.hasOwnProperty.call(this.wantedConfiguration.devices, running))
                ||(!compatible(this.currentConfiguration.devices[running], this.wantedConfiguration.devices[running]))
                ||(restartId !== - 1))
            {
                if (restartId !== -1) {
                    this.currentConfiguration.restartList.splice(restartId, 1);
                }

                return {
                    cmd: cmdFor(false, running, this.currentConfiguration.devices[running]),
                    done: ()=>{
                        delete this.currentConfiguration.devices[running];
                        return 1;
                    }
                }
            }
        }

        // Start new requirements
        for(const wanted of Object.keys(this.wantedConfiguration.devices)) {
            if (!Object.prototype.hasOwnProperty.call(this.currentConfiguration.devices, wanted)) {
                var details = Obj.deepCopy(this.wantedConfiguration.devices[wanted]);

                return {
                    cmd: cmdFor(true, wanted, details),
                    done: ()=>{
                        this.currentConfiguration.devices[wanted] = details;
                        return 1;
                    }
                }
            }
        }

        return undefined;
    }

    // Build a promise that update or ping indiserver
    // The promise generate 0 (was pinged), 1 (was updated), dead: indiserver unreachable
    private async pushOneDriverChange(ct: CancellationToken)
    {
        let todo = this.calcToStartStop();
        if (todo === undefined) {
            // Just ping, then
            todo = {
                cmd: 'ping',
                done: function() {
                    return 0;
                }
            }
        } else {
            console.log('Indi: fifo order: ' + todo.cmd);
        }
        const fifopath = this.actualFifoPath();

        function shellEscape(str:string)
        {
            return "'" + str.replace(/'/g, "'\"'\"'") + "'";
        }
        
        try {
            if (fifopath === null) {
                throw new Error("no fifopath set");
            }
            await Timeout(ct, async(ct:CancellationToken)=> {
                    if (await SystemPromise.Exec(ct, {
                                    command: ["/bin/bash", "-c" , "echo -E " + shellEscape(todo!.cmd)  + ' > ' + shellEscape(fifopath)]
                            }) !== 0)
                    {
                        throw new Error("Fifo write failed");
                    }
                    todo!.done();
                },
                5000,
                ()=>{
                    const e = new Error(todo!.cmd === 'ping' ? 'Indi ping timedout' : 'Indi fifo command timedout');
                    (e as any).isFifoTimeout = true;
                    return e;
                }

            );
            return todo!.cmd === 'ping' ? 0 : 1;
        } catch(e) {
            console.warn('IndiServer error', e);
            this.currentConfiguration.devices = {};
            return 'dead';
        }
    }

    // Start the lifecycle
    // check if indiserver is running. If so, assume that the drivers are all started
    // otherwise,
    startLifeCycle=()=>{
        createTask<void>(CancellationToken.CONTINUE, async (task:Task<void>)=> {
            if (this.lifeCycle !== null) {
                return;
            }
            this.lifeCycle = task;
            try {
                const exists = await this.findIndiServer(task.cancellation, true);
                
                if (!exists) {
                    await this.startIndiServer(task.cancellation);
                }
                let status;
                do {
                    const status = await this.pushOneDriverChange(task.cancellation);

                    if (status === 0 || status === 'dead') {
                        await Sleep(task.cancellation, 2000);
                    }
                } while(this.wantedConfiguration.autorun && status !== "dead");
            } catch(error) {
                console.log('IndiServerStarter error:', error);
            } finally {
                this.lifeCycle = null;
                if (this.wantedConfiguration.autorun) {
                    setTimeout(this.startLifeCycle, 1000);
                }
            }
        });
    }
}

module.exports = IndiServerStarter;