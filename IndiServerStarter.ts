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
            libpath: null,
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

    private cleanFifo=async (fifopath:string|null)=>{
        if (fifopath === null) {
            return;
        }
        logger.info('Cleaning fifo', {fifopath});
        await SystemPromise.Exec(CancellationToken.CONTINUE, {command: ["rm", "-f", "--", fifopath]});
    }

    private startIndiServer=async (ct: CancellationToken):Promise<{fifopath:string, pid:number}>=>{
        this.indiServerStartAttempt++;

        this.currentConfiguration.fifopath = this.wantedConfiguration.fifopath;
        this.currentConfiguration.path = this.wantedConfiguration.path;

        const fifopath = this.buildFifoPath();
        if (fifopath === null) {
            throw new Error("Invalid indi fifo path");
        }
        const env = {... process.env};
        if (this.currentConfiguration.path != null) {
            env.PATH = this.currentConfiguration.path + ":" + env['PATH']
        }

        if (this.currentConfiguration.libpath) {
            env.LD_LIBRARY_PATH= this.currentConfiguration.libpath + (env.LD_LIBRARY_PATH ? ":" + env.LD_LIBRARY_PATH : "")
        }

        if (await SystemPromise.Exec(ct, {command: ["rm", "-f", "--", fifopath]}) !== 0) {
            throw new Error("rm failed");
        }

        if (await SystemPromise.Exec(ct, {command: ["mkfifo", "--", fifopath]}) !== 0) {
            throw new Error("mkfifo failed");
        }

        logger.debug('Starting indiserver');
        const child = child_process.spawn('indiserver', ['-v', '-f', fifopath], {
                env: env,
                detached: true,
                stdio: ['ignore', process.stdout, process.stderr],
            });
        child.on('error', (err:any)=> {
            logger.warn("Process indiserver error", err);
        });
        if (child.pid === undefined) {
            throw new Error("Unable to start indiserver (error will follow)");
        }
        logger.info('Started indiserver', {pid: child.pid});
        this.currentConfiguration.devices = {};
        return {pid: child.pid, fifopath};
    }

    public restartDevice=async (ct:CancellationToken, dev:string)=>
    {
        if (this.currentConfiguration.restartList.indexOf(dev) != -1) {
            return;
        }
        logger.info("Pushing driver restart", {dev});
        this.currentConfiguration.restartList.push(dev);

    }

    private buildFifoPath=():string=>{
        let fifopath;
        if (this.currentConfiguration.fifopath === null) {
            fifopath = "/tmp/indiserverfifo";
        } else {
            fifopath = this.currentConfiguration.fifopath;
        }
        
        if (this.currentConfiguration.autorun) {
            // Generate a unique fifo path
            fifopath += "." + Date.now() + "." + process.pid;
        }
        return fifopath;
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
    // The promise generate 0 (was pinged), 1 (was updated), 2 (skipped), "dead": indiserver unreachable
    private async pushOneDriverChange(ct: CancellationToken, fifopath: string, lastPingAge: number|undefined): Promise<number|"dead">
    {
        let todo = this.nextToStartStop();
        let delay: number = 0;
        if (todo !== undefined) {
            if (todo.notBefore !== undefined) {
                delay = todo.notBefore - Date.now();
                if (delay < 0) {
                    delay = 0;
                }
                if (delay > 1000) {
                    todo = undefined;
                }
            }
        }

        if (delay > 0) {
            await Sleep(ct, delay);
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

            if (lastPingAge !== undefined && lastPingAge < 30000) {
                // Skip ping...
                return 2
            }
            logger.debug('Indi: fifo order', {cmd: todo.cmd});
        } else {
            logger.info('Indi: fifo order', {cmd: todo.cmd});
        }

        function shellEscape(str:string)
        {
            return "'" + str.replace(/'/g, "'\"'\"'") + "'";
        }
        
        try {
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
                todo!.cmd === 'ping' ? 5000 : 120000,
                ()=>{
                    const e = new Error(todo!.cmd === 'ping' ? 'Indi ping timedout' : 'Indi fifo command timedout');
                    (e as any).isFifoTimeout = true;
                    return e;
                }

            );
            return todo!.cmd === 'ping' ? 0 : 1;
        } catch(e) {
            logger.error('IndiServer error', e);
            if (!(e as any).isFifoTimeout) {
                this.currentConfiguration.devices = {};
            } else {
                logger.error('Assuming unchanged configuration', e);
            }
            this.indiFifoError++;
            return 'dead';
        }
    }

    private readonly getFifoFromPid = async (ct: CancellationToken, pid:number): Promise<string|undefined> => {
        let cmd = await SystemPromise.getCommand(ct, pid);
        for(let i = 0; i < cmd.length - 1; ++i) {
            if (cmd[i] === '-f') {
                return cmd[i + 1];
            }
        }
        return undefined;
    }

    private indiServerTrouble: boolean = false;

    // Notify the lifecycle that from now, the indi server may be in trouble
    public readonly onIndiConnectionLost = () => {
        this.indiServerTrouble = true;
    }

    // Start the lifecycle
    // check if indiserver is running. If so, assume that the drivers are all started
    // otherwise,
    startLifeCycle=()=>{
        createTask<void>(CancellationToken.CONTINUE, async (task:Task<void>)=> {
            if (this.lifeCycle !== null) {
                return;
            }
            let fifopath: string|undefined = undefined;
            const startup_delay = 500;
            this.lifeCycle = task;
            try {
                let lastIndiSeen: number|undefined = undefined;
                let lastIndiStart: number|undefined = undefined;
                let lastPing: number|undefined = undefined;
                let firstCheck = true;
                let needPidCheck = true;
                do {
                    if (needPidCheck || this.indiServerTrouble) {
                        const serverPids = await SystemPromise.PidOf(task.cancellation, 'indiserver');
                        if (serverPids.length > 0) {
                            if (firstCheck) {
                                logger.warn('Existing indiserver process found. Assuming it already has the right configuration.', {serverPids});
                                // Deduce fifopath from pid
                                this.currentConfiguration = {
                                    ...Obj.deepCopy(this.wantedConfiguration),
                                    restartList: [],
                                    startDelay: {},
                                };
                                for(const pid of serverPids) {
                                    fifopath = await this.getFifoFromPid(task.cancellation, pid);
                                    if (fifopath !== undefined) {
                                        logger.info('Found fifo path', {fifopath});
                                        break;
                                    }
                                }
                                if (fifopath === undefined) {
                                    logger.error('Unable to find fifo path from pid', {serverPids});
                                }
                            } else {
                                if (lastIndiStart !== undefined && (lastIndiSeen === undefined || lastIndiSeen < lastIndiStart)) {
                                    logger.info("Indi server is alive", {serverPids});
                                } else {
                                    logger.debug("Indi server is alive", {serverPids});
                                }
                            }
                            lastIndiSeen = Date.now();
                            if (lastIndiStart === undefined) {
                                lastIndiStart = lastIndiSeen;
                            }
                        } else {
                            lastPing = undefined;
                            logger.warn("Indiserver process not found");
                            if (lastIndiSeen === undefined || lastIndiSeen < Date.now() - 10000) {
                                if (lastIndiStart !== undefined) {
                                    logger.error("Indiserver process not found for more than 10s.");
                                }
                                if (lastIndiStart === undefined || lastIndiStart < Date.now() - 30000) {
                                    if (lastIndiStart !== undefined) {
                                        logger.error("Attempting restart of indiserver");
                                    } else {
                                        logger.info("Attempting startup of indiserver start");
                                    }

                                    lastIndiStart = Date.now();
                                    if (fifopath !== undefined) {
                                        await this.cleanFifo(fifopath);
                                        fifopath = undefined;
                                    }

                                    ({fifopath} = await this.startIndiServer(task.cancellation));
                                    this.currentConfiguration.restartList = [];
                                }
                            }
                        }
                        firstCheck = false;
                    }

                    let sleep_duration = 1000;
                    if ((fifopath !== undefined) && (lastIndiStart !== undefined && lastIndiStart < Date.now() - startup_delay)) {
                        let status = await this.pushOneDriverChange(task.cancellation, fifopath!, (lastPing !== undefined && !this.indiServerTrouble) ? Date.now() - lastPing: undefined);
                        if (status !== 2 && status !== 'dead') {
                            // If the ping was skipped, we don't update the lastPing
                            lastPing = Date.now();
                            this.indiServerTrouble = false;
                        }
                        if (status === 1) {
                            // We sent an order, continue asap
                            sleep_duration = 20;
                        }
                        // As long as we are able to communicate with the server, we assume it is alive
                        needPidCheck = (status === 'dead');
                    } else {
                        if (fifopath !== undefined) {
                            sleep_duration = startup_delay;
                        } else {
                            sleep_duration = 100;
                        }
                        needPidCheck = true;
                    }

                    await Sleep(task.cancellation, sleep_duration);
                } while(this.wantedConfiguration.autorun);
            } catch(error) {
                logger.error('IndiServerStarter error', error);
            } finally {
                this.lifeCycle = null;
                // We may leak a fifo here in case of crash, but that will allow next instance to start properly
                if (this.wantedConfiguration.autorun) {
                    setTimeout(this.startLifeCycle, 1000);
                }
            }
        });
    }
}
