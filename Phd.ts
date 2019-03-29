import net from 'net';
import * as Obj from './Obj.js';
import ConfigStore from './ConfigStore';
import ProcessStarter from './ProcessStarter';
import { ExpressApplication } from './ModuleBase.js';
import JsonProxy from './JsonProxy.js';
import { BackofficeStatus, PhdStatus, PhdGuideStep, PhdSettling, PhdAppState } from './shared/BackOfficeStatus.js';
import CancellationToken from 'cancellationtoken';
import Sleep from './Sleep.js';
import { createTask } from './Task.js';

export type PhdRequest = {
    then: (result: any)=>(void);
    error: (error: any)=>(void);
};

export type Listener = {
    test: ()=>(void);
}

class Phd {
    private appStateManager: JsonProxy<BackofficeStatus>;
    private running: boolean;
    private pendingRequests: {[id:string]:PhdRequest};
    private eventListeners: {[id:string]:Listener};
    private readonly currentStatus: PhdStatus;
    private readonly steps: PhdStatus["guideSteps"];
    private stepId: number;
    private reqId: number;
    private clientData: string;
    private client: undefined|net.Socket;

    constructor(app:ExpressApplication, appStateManager:JsonProxy<BackofficeStatus>)
    {
        this.appStateManager = appStateManager;

        this.running = true;
        this.stepId = 0;
        this.reqId = 0;
    
        this.clientData = "";

        this.appStateManager.getTarget().phd = {
            // Connecting
            phd_started: false,

            connected: false,

            AppState: "NotConnected",

            // null until known
            settling: null,

            guideSteps: {},
            configuration: {
                autorun: false,
                path: null,
                env: {},
            },
            firstStepOfRun: this.stepIdToUid(this.stepId),

            RADistanceRMS:null,
            DECDistanceRMS:null,
            RADECDistanceRMS:null,
            RADistancePeak: null,
            DECDistancePeak: null,
            RADECDistancePeak: null,
            star:null,
        }

        this.pendingRequests = {};
        this.eventListeners = {};

        this.currentStatus = this.appStateManager.getTarget().phd;
        // Cet objet contient les dernier guide step
        this.steps = this.currentStatus.guideSteps;


        new ConfigStore(appStateManager, 'phd', ['phd', 'configuration'], {
            autorun: false,
            path: null,
            env: {
                DISPLAY: ":0",
                XAUTHORITY: process.env.HOME + "/.Xauthority"
            }
        }, {
            autorun: true,
            path: "/path/of/phd2/",
            env: {
                DISPLAY: "Whatever X11 setting required",
                XAUTHORITY: "Whatever other X11 setting required"
            }
        });

        this.updateStepsStats();

        new ProcessStarter('phd2', this.currentStatus.configuration);

        // FIXME: handle autoconnect
        this.lifeCycle(CancellationToken.CONTINUE);
    }


    private lifeCycle=async (ct: CancellationToken)=>{
        while(true) {
            try {
                await createTask(ct, (task)=>new Promise(
                    (resolve, reject)=>
                        {
                            this.clientData = "";
                            this.client = new net.Socket();

                            this.client.on('data', (data)=>{
                                console.log('Received: ' + data);
                                this.clientData += data;
                                this.flushClientData();
                            });

                            this.client.on('error', (e)=> {
                                console.log('Phd socket error', e);
                            })

                            this.client.on('close', ()=>{
                                console.log('Phd connection closed');
                                this.client = undefined;

                                // FIXME: flushing these messages can lead to change (including reconnection ?)
                                this.flushClientData();

                                var oldPendingRequests = this.pendingRequests;
                                this.pendingRequests = {};
                                for(const k of Object.keys(oldPendingRequests)) {
                                    try {
                                        oldPendingRequests[k].error({message: 'PHD disconnected'});
                                    } catch(e) {
                                        console.warn('Error in PHD request error handler', e);
                                    }
                                }

                                this.currentStatus.star = null;
                                this.currentStatus.AppState = "NotConnected";
                                this.currentStatus.settling = null;

                                this.signalListeners();

                                resolve();
                            });

                            this.client.connect(4400, '127.0.0.1', function() {
                                console.log('Connected to phd');
                            });
                            task.cancellation.onCancelled(()=> {
                                this.client!.destroy();
                            });
                        }
                ));
            } catch(e) {
                console.warn("Phd error", e);
            }

            await Sleep(ct, 2000);
        }
    }

    private stepIdToUid=(stepId:number):string=>{
        const uid = ("000000000000000" + stepId.toString(16)).substr(-16);
        return uid;
    }

    private updateStepsStats=()=>
    {
        // calcul RMS et RMS ad/dec
        var rms = [0, 0];
        var count = 0;
        var keys:Array<keyof PhdGuideStep> = ['RADistanceRaw', 'DECDistanceRaw']
        var log = [];
        var maxs = [0, 0, 0];
        var minUid = this.currentStatus.firstStepOfRun;
        Outer: for(var uid in this.steps)
        {
            if (uid < minUid) continue;

            var step:PhdGuideStep = this.steps[uid];
            const vals:number[] = [];
            for(const key of keys)
            {
                if (step[key] !== null && step[key] !== undefined) {
                    vals.push(step[key] as number);
                } else {
                    continue Outer;
                }
            }

            var dst2 = 0;
            for(var i = 0; i < keys.length; ++i) {
                let v:number = vals[i];
                if (Math.abs(v) > maxs[i]) {
                    maxs[i] = Math.abs(v);
                }
                var v2 = v * v;
                dst2 += v2;
                rms[i] += v2;
            }
            if (dst2 > maxs[2]) {
                maxs[2] = dst2;
            }
            count++;
        }

        maxs[2] = Math.sqrt(maxs[2]);

        function calcRms(sqr:number, div:number):number|null
        {
            if (div == 0) {
                return null;
            }
            return Math.sqrt(sqr / div);
        }

        this.currentStatus.RADistanceRMS = calcRms(rms[0], count);
        this.currentStatus.DECDistanceRMS = calcRms(rms[1], count);
        this.currentStatus.RADECDistanceRMS = calcRms(rms[0] + rms[1], count);

        function calcPeak(val:number, div:number)
        {
            if (div == 0) {
                return null;
            }
            return val;
        }
        this.currentStatus.RADistancePeak = calcPeak(maxs[0], count);
        this.currentStatus.DECDistancePeak = calcPeak(maxs[1], count);
        this.currentStatus.RADECDistancePeak = calcPeak(maxs[2], count);
    }

    signalListeners() {
        for(var k of Object.keys(this.eventListeners)) {
            if (Obj.hasKey(this.eventListeners, k)) {
                this.eventListeners[k].test();
            }
        }
    }

    pushStep(simpleEvent:PhdGuideStep) {
        console.log('Push step: ' + simpleEvent);
        this.stepId++;
        if (this.stepId > 400) {
            delete this.steps[this.stepIdToUid(this.stepId - 400)];
        }
        this.steps[this.stepIdToUid(this.stepId)] = simpleEvent;
        this.updateStepsStats();
    }

    flushClientData()
    {
        // FIXME: consume datas.
        var cutAt;
        while((cutAt = this.clientData.indexOf("\r\n")) != -1)
        {
            var data = this.clientData.substr(0, cutAt);
            this.clientData = this.clientData.substr(cutAt + 2);
            console.log('received json : ' + data);
            var statusUpdated = false;
            try {
                var event = JSON.parse(data);

                if ("Event" in event) {
                    const eventToStatus:{[id:string]:PhdAppState} = {
                        "GuideStep":                "Guiding",
                        "Paused":                   "Paused",
                        "StartCalibration":         "Calibrating",
                        "LoopingExposures":         "Looping",
                        "LoopingExposuresStopped":  "Stopped",
                        "StarLost":                 "LostLock"
                    };
                    switch (event.Event) {
                        case "AppState":
                            this.currentStatus.connected = true;
                            this.currentStatus.AppState = event.State;
                            this.currentStatus.star = null;
                            this.currentStatus.settling = null;
                            console.log('Initial status:' + this.currentStatus.AppState);
                            break;
                        case "SettleBegin":
                        case "Settling":
                            this.currentStatus.settling = {running: true};
                            break;
                        case "SettleDone":
                            {
                                const newStatus: PhdSettling = {running: false, status: event.Status == 0};
                                if ('Error' in event) {
                                    newStatus.error = event.Error;
                                }
                                console.log('PHD : settledone => ', JSON.stringify(newStatus));
                                this.currentStatus.settling = newStatus;
                                break;
                            }
                        default:
                            if (event.Event in eventToStatus) {
                                var newStatus = eventToStatus[event.Event];
                                var oldStatus = this.currentStatus.AppState;
                                if (oldStatus != newStatus) {
                                    this.currentStatus.star = null;
                                    this.currentStatus.AppState = newStatus;
                                    if (newStatus == 'Guiding' && oldStatus != 'Paused' && oldStatus != 'LostLock') {
                                        this.currentStatus.firstStepOfRun = this.stepIdToUid(this.stepId + 1);
                                        this.updateStepsStats();
                                    }
                                    console.log('New status:' + this.currentStatus.AppState);
                                    if (newStatus != 'Guiding' && newStatus != 'LostLock') {
                                        this.currentStatus.settling = null;
                                    }
                                }
                            }
                    };
                    if ((event.Event == "Paused") || (event.Event == "LoopingExposuresStopped")) {
                        // Push an empty step, to cause interruption in the guiding graph
                        this.pushStep({
                            Timestamp: event.Timestamp,
                            settling: false
                        });
                    }
                    if (event.Event == "GuideStep") {
                        this.currentStatus.star = {
                            SNR: event.SNR,
                            StarMass: event.StarMass
                        };
                        // Settling is sent just before GuideStep. So not settling
                        if (this.currentStatus.settling === null) {
                            this.currentStatus.settling = {running: false};
                        }


                        var simpleEvent = Object.assign({}, event);
                        delete simpleEvent.Event;
                        delete simpleEvent.Host;
                        delete simpleEvent.Inst;
                        delete simpleEvent.Mount;
                        simpleEvent.settling = this.currentStatus.settling.running;
                        this.pushStep(simpleEvent);
                    }

                    this.signalListeners();
                } else if ("jsonrpc" in event) {
                    var id = event.id;
                    if (Object.prototype.hasOwnProperty.call(this.pendingRequests, id)) {
                        console.log('got result for request ' + id);
                        const doneRequest = this.pendingRequests[id];
                        delete this.pendingRequests[id];
                        try {
                            if (Object.prototype.hasOwnProperty.call(event, 'error')) {
                                doneRequest.error(event.error);
                            } else {
                                doneRequest.then(event.result);
                            }
                        }catch(e) {
                            console.error('Phd request callback error:', e.stack || e);
                        }
                    }
                }
            }catch(e) {
                console.error('Phd error:', e.stack || e);
            }
        }
    }

    // getStatus(req, res, next)
    // {
    //     res.jsonResult = this.currentStatus;
    //     next();
    // }

    async wait(ct:CancellationToken, condition:()=>boolean) {
        return await new Promise((resolve, reject)=> {
            let uid:string|undefined;
            let ctCb: (()=>(void))|undefined;

            const unregister=()=>{
                if (uid !== undefined) {
                    delete this.eventListeners[uid];
                    uid = undefined;
                    return true;
                }
                if (ctCb) {
                    ctCb();
                    ctCb = undefined;
                }
                return false;
            }
            if (this.client === undefined) {
                throw "PHD not connected";
            }
            uid = "" + this.reqId++;
            this.eventListeners[uid] = {
                test: ()=>{
                    let rslt;
                    try {
                        rslt = condition();
                    } catch(error) {
                        unregister();
                        reject(error);
                        return;
                    }

                    if (rslt) {
                        unregister();
                        resolve(rslt);
                    }
                }
            };
            ctCb = ct.onCancelled((reason)=>{
                unregister();
                reject(new CancellationToken.CancellationError(reason));
            });
        });
    }

    // Return a promise that send the order (generator) and waits for a result
    async sendOrder(ct:CancellationToken, order:any) {
        return await new Promise((resolve, reject)=> {
            let uid:string|undefined;
            let ctCb: (()=>(void))|undefined;

            const unregister=()=>{
                if (uid !== undefined) {
                    delete this.pendingRequests[uid];
                    uid = undefined;
                    return true;
                }
                if (ctCb) {
                    ctCb();
                    ctCb = undefined;
                }
                return false;
            }
            if (this.client === undefined) {
                throw "PHD not connected";
            }
            uid = "" + this.reqId++;
            order = {...order, id: uid};

            console.log('Pushing request: ' + JSON.stringify(order));
            this.client.write(JSON.stringify(order) + "\r\n");

            this.pendingRequests[uid] = {
                then: (rslt)=>{
                    unregister();
                    resolve(rslt);
                },
                error: (err)=>{
                    unregister();
                    if (err.message) {
                        reject(new Error(order.method + ": " +err.message));
                    } else {
                        reject(new Error(order.method + " failed"));
                    }
                },
            };
            ctCb = ct.onCancelled((reason)=>{
                unregister();
                reject(new CancellationToken.CancellationError(reason));
            });
        });
    }

    public dither=async (ct:CancellationToken)=>{

        // Il faut attendre un settledone
        await this.sendOrder(ct, {
                method: "dither",
                params:[
                    1,/* ammount */
                    false, /* ra only */
                    {
                        pixels: 1.5,
                        time:   10,
                        timeout: 60
                    }
                ]
            });

        await this.wait(ct, () =>{
                if (!this.currentStatus.connected) {
                    throw new Error("PHD disconnected during settle");
                }
                if (this.currentStatus.settling != null) {
                    if (this.currentStatus.settling.running) {
                        // Not done now
                        return false;
                    }
                    if (this.currentStatus.settling.status) {
                        // Sucess
                        return true;
                    }
                    if (this.currentStatus.settling.error) {
                        throw new Error("Dithering failed: " + this.currentStatus.settling.error);
                    }
                    throw new Error("Dithering failed");
                }
                // Not settling ?
                console.log("PHD: not settling after dither ?");
                return false;
            });
    }

    $api_connect = async(ct:CancellationToken)=>{
        return await this.sendOrder(ct, {
            method: "set_connected",
            params: [ true ]
        });
    }

    $api_startGuide = async(ct:CancellationToken)=>{
        await this.$api_connect(ct);

        return await this.sendOrder(ct, {
                method: "guide",
                params: [
                    {"pixels": 1.5, "time": 10, "timeout": 60},
                    false
                ]
            });
    }

    $api_stopGuide = async(ct:CancellationToken)=>{
        await this.$api_connect(ct);
        return await this.sendOrder(ct, {
                method: 'stop_capture',
            });
    }
}

module.exports = {Phd};
