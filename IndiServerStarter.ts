import child_process from 'child_process';
import CancellationToken from 'cancellationtoken';
import Log from './Log';
import { IndiServerConfiguration, IndiServerState, IndiDeviceConfiguration } from './shared/BackOfficeStatus';
import * as SystemPromise from './SystemPromise';
import Timeout from './Timeout';
import { Task, createTask } from './Task';
import Sleep from './Sleep';
import * as Metrics from "./Metrics";

import * as Obj from './shared/Obj';
import { AppContext } from './ModuleBase';

const logger = Log.logger(__filename);

type IndiTodoItem = {
    cmd: string;
    notBefore: number|undefined;
    start: ()=>void;
    done: ()=>number;

}

// Ensure that indiserver is running.
// Restart as required.
export default class IndiServerStarter {
    private currentConfiguration: IndiServerState;
    private wantedConfiguration: IndiServerConfiguration;
    private lifeCycle: Task<void>|null;
    private context: AppContext;

    private indiFifoError : number = 0;
    private indiServerStartAttempt : number = 0;
    private indiDriverStartAttempt : {[id:string]: number} = {};
    private indiDriverStopAttempt : {[id:string]: number} = {};

    constructor(wantedConfiguration: IndiServerConfiguration, context: AppContext) {
        this.context = context;
        // The actual status of indiserver
        this.currentConfiguration = {
            path: null,
            fifopath: null,
            devices: {},
            autorun: true,
            restartList: [],
            startDelay: {},
        };

        this.wantedConfiguration = wantedConfiguration;

        this.lifeCycle = null;

        if (this.wantedConfiguration.autorun) this.startLifeCycle();
    }

    public async metrics(): Promise<Array<Metrics.Definition>> {
        const ret : Array<Metrics.Definition> = [];

        ret.push({
            name: 'indi_fifo_error_count',
            type: "counter",
            help: 'Number of communication error over indi server fifo',
            value: this.indiFifoError
        });

        ret.push({
            name: 'indi_server_start_attempt_count',
            type: "counter",
            help: 'Number of attempt to start indi server',
            value: this.indiServerStartAttempt
        });

        for(const driver of Object.keys(this.indiDriverStartAttempt)) {
            ret.push({
                name: 'indi_driver_start_attempt_count',
                type: "counter",
                help: 'Number of attempt to start indi driver',
                labels: {
                    driver
                },
                value: this.indiDriverStartAttempt[driver]
            });
        }
        for(const driver of Object.keys(this.indiDriverStopAttempt)) {
            ret.push({
                name: 'indi_driver_stop_attempt_count',
                type: "counter",
                help: 'Number of attempt to stop indi driver',
                labels: {
                    driver
                },
                value: this.indiDriverStopAttempt[driver]
            });
        }

        return ret;
    }

    // check if a valid indiserver process exists
    private findIndiServer= async (ct: CancellationToken, resetConf:boolean)=>{
        const exists = await SystemPromise.PidOf(ct, 'indiserver');
        
        if (resetConf) {
            if (exists) {
                this.currentConfiguration = {
                    ...Obj.deepCopy(this.wantedConfiguration),
                    restartList: [],
                    startDelay: {},
                };
                logger.warn('Indiserver process found. Assuming it already has the right configuration.');
            } else {
                logger.info('Indiserver process not found.');
            }
        };
        this.currentConfiguration.restartList = [];
        return exists;
    }

    private startIndiServer=async (ct: CancellationToken)=>{
        this.indiServerStartAttempt++;

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

        if (await SystemPromise.Exec(ct, {command: ["mkfifo", "--", fifopath]}) !== 0) {
            throw new Error("mkfifo failed");
        }

        logger.debug('Starting indiserver');
        var child = child_process.spawn('indiserver', ['-v', '-f', fifopath], {
                env: env,
                detached: true,
                stdio: ['ignore', process.stdout, process.stderr],
            });
        child.on('error', (err:any)=> {
            logger.warn("Process indiserver error", err);
        });
        logger.info('Started indiserver', {pid: child.pid});
        this.currentConfiguration.devices = {};
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
    private calcToStartStop:()=>Array<IndiTodoItem>=()=>
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
            if (start) {
                rslt += " -n " + quote(devName);
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

        // Ensure all drivers are know of stats
        for(const drvId of [...Object.keys(this.currentConfiguration.devices), ...Object.keys(this.wantedConfiguration.devices)]) {
            if (!Object.prototype.hasOwnProperty.call(this.indiDriverStartAttempt, drvId)) {
                this.indiDriverStartAttempt[drvId] = 0;
            }
            if (!Object.prototype.hasOwnProperty.call(this.indiDriverStopAttempt, drvId)) {
                this.indiDriverStopAttempt[drvId] = 0;
            }
        }

        const ret:Array<IndiTodoItem> = [];

        // Stop what is not required anymore
        for(const running of Object.keys(this.currentConfiguration.devices)) {
            const restartId = this.currentConfiguration.restartList.indexOf(running);
            if ((!Object.prototype.hasOwnProperty.call(this.wantedConfiguration.devices, running))
                ||(!compatible(this.currentConfiguration.devices[running], this.wantedConfiguration.devices[running]))
                ||(restartId !== - 1))
            {
                logger.info("About to stop driver", { id: running, state: this.currentConfiguration.devices});

                ret.push({
                    notBefore: undefined,
                    start: ()=>{
                        if (restartId !== -1) {
                            this.currentConfiguration.restartList.splice(restartId, 1);
                        }
                        this.indiDriverStopAttempt[running] ++;
                    },
                    cmd: cmdFor(false, running, this.currentConfiguration.devices[running]),
                    done: ()=>{
                        delete this.currentConfiguration.devices[running];
                        // Don't restart too fast. Indi server sometime gets confused
                        this.currentConfiguration.startDelay[running] = Date.now() + 1000;
                        return 1;
                    }
                });
            }
        }

        if (ret.length) {
            return ret;
        }

        // Start new requirements
        for(const wanted of Object.keys(this.wantedConfiguration.devices)) {
            if (!Object.prototype.hasOwnProperty.call(this.currentConfiguration.devices, wanted)) {
                const details = Obj.deepCopy(this.wantedConfiguration.devices[wanted]);

                logger.info("About to start driver", {id: wanted, state: this.currentConfiguration.devices});

                ret.push({
                    notBefore: Obj.getOwnProp(this.currentConfiguration.startDelay, wanted),
                    start: ()=>{
                        this.indiDriverStartAttempt[wanted] ++;
                    },
                    cmd: cmdFor(true, wanted, details),
                    done: ()=>{
                        this.currentConfiguration.devices[wanted] = details;
                        return 1;
                    }
                });
            }
        }

        return ret;
    }

    private nextToStartStop:()=>IndiTodoItem|undefined=()=>{
        function notBeforeSorter(a:IndiTodoItem, b:IndiTodoItem) {
            if (a.notBefore === undefined) {
                if (b.notBefore === undefined) {
                    return 0;
                }
                return -1;
            }
            if (b.notBefore === undefined) {
                return 1;
            }
            if (a.notBefore < b.notBefore) {
                return -1;
            }
            if (a.notBefore > b.notBefore) {
                return 1;
            }
            return 0;
        }
        const candidates = this.calcToStartStop().sort(notBeforeSorter);
        if (!candidates.length) {
            return undefined;
        }
        return candidates[0];
    }

    // Build a promise that update or ping indiserver
    // The promise generate 0 (was pinged), 1 (was updated), dead: indiserver unreachable
    private async pushOneDriverChange(ct: CancellationToken)
    {
        let todo = this.nextToStartStop();
        let delay: number = 0;
        if (todo !== undefined) {
            if (todo.notBefore !== undefined) {
                delay = todo.notBefore - Date.now();
                if (delay < 0) {
                    delay = 0;
                }
                if (delay >= 2000) {
                    todo = undefined;
                }
            }
        }

        if (delay > 0) {
            await Sleep(ct, delay);
            return;
        }

        if (todo === undefined) {
            // Just ping, then
            todo = {
                notBefore: undefined,
                start: ()=>{},
                cmd: 'ping',
                done: function() {
                    return 0;
                }
            }
        } else {
            logger.info('Indi: fifo order', {cmd: todo.cmd});
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
                    todo!.start();
                    if (await SystemPromise.Exec(ct, {
                                    command: ["/bin/bash", "-c" , "echo -E " + shellEscape(todo!.cmd)  + ' > ' + shellEscape(fifopath)]
                            }) !== 0)
                    {
                        throw new Error("Fifo write failed");
                    }
                    todo!.done();
                },
                120000,
                ()=>{
                    const e = new Error(todo!.cmd === 'ping' ? 'Indi ping timedout' : 'Indi fifo command timedout');
                    (e as any).isFifoTimeout = true;
                    return e;
                }

            );
            return todo!.cmd === 'ping' ? 0 : 1;
        } catch(e) {
            logger.error('IndiServer error', e);
            if (!e.isFifoTimeout) {
                this.currentConfiguration.devices = {};
            } else {
                logger.error('Assuming unchanged configuration', e);
            }
            this.indiFifoError++;
            return 'dead';
        }
    }

    // Start the lifecycle
    // check if indiserver is running. If so, assume that the drivers are all started
    // otherwise,
    startLifeCycle=()=>{
        createTask<void>(CancellationToken.CONTINUE, async (task:Task<void>)=> {
            let ranSuccessfully = false;
            let firstStart = true;
            if (this.lifeCycle !== null) {
                return;
            }
            this.lifeCycle = task;
            try {
                let status;
                do {
                    const exists = await this.findIndiServer(task.cancellation, firstStart);
                    firstStart = false;

                    if (!exists) {
                        if (ranSuccessfully) {
                            logger.error('IndiServer stopped existing');
                            this.context.notification.error('Indiserver was stopped/crashed');
                        }
                        await this.startIndiServer(task.cancellation);
                        ranSuccessfully = false;
                    }

                    status = await this.pushOneDriverChange(task.cancellation);
                    if (status !== 'dead') {
                        ranSuccessfully = true;
                    }
                    if (status === 0 || status === 'dead') {
                        await Sleep(task.cancellation, 2000);
                    }
                } while(this.wantedConfiguration.autorun);
            } catch(error) {
                logger.error('IndiServerStarter error', error);
            } finally {
                this.lifeCycle = null;
                if (this.wantedConfiguration.autorun) {
                    setTimeout(this.startLifeCycle, 1000);
                }
            }
        });
    }
}
