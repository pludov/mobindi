import net from 'net';
import CancellationToken from 'cancellationtoken';
import * as Obj from './Obj.js';
import ConfigStore from './ConfigStore';
import ProcessStarter from './ProcessStarter';
import { ExpressApplication, AppContext } from './ModuleBase.js';
import JsonProxy from './JsonProxy.js';
import { BackofficeStatus, PhdStatus, PhdGuideStep, PhdSettling, PhdAppState, DitheringSettings, PhdConfiguration } from './shared/BackOfficeStatus.js';
import * as RequestHandler from "./RequestHandler";
import * as BackOfficeAPI from "./shared/BackOfficeAPI";
import Sleep from './Sleep.js';
import { createTask, Task } from './Task.js';

export type PhdRequest = {
    then: (result: any)=>(void);
    error: (error: any)=>(void);
};

export type Listener = {
    test: ()=>(void);
}

const defaultDithering= ():DitheringSettings => ({
    amount: 1,
    pixels: 0.3,
    raOnly: false,
    time: 10,
    timeout: 60,
});

export default class Phd
        implements RequestHandler.APIAppProvider<BackOfficeAPI.PhdAPI>
{
    private appStateManager: JsonProxy<BackofficeStatus>;
    private running: boolean;
    private pendingRequests: {[id:string]:PhdRequest};
    private eventListeners: {[id:string]:Listener};
    public readonly currentStatus: PhdStatus;
    private readonly steps: PhdStatus["guideSteps"];
    private readonly context: AppContext;
    private stepId: number;
    private reqId: number;
    private clientData: string;
    private client: undefined|net.Socket;

    /** current stream capture */
    private streamCapture:Task<void>|undefined;
    private streamCaptureCanceled: boolean|undefined;
    private streamCaptureDevice: string|undefined;

    constructor(app:ExpressApplication, appStateManager:JsonProxy<BackofficeStatus>, context: AppContext)
    {
        this.appStateManager = appStateManager;
        this.context= context;
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
                preferredDithering: defaultDithering(),
            },
            firstStepOfRun: this.stepIdToUid(this.stepId),

            RADistanceRMS:null,
            DECDistanceRMS:null,
            RADECDistanceRMS:null,
            RADistancePeak: null,
            DECDistancePeak: null,
            RADECDistancePeak: null,
            star:null,
            currentEquipment: {},
            exposureDurations: [],
            streamingCamera: null,
        }

        this.pendingRequests = {};
        this.eventListeners = {};

        this.currentStatus = this.appStateManager.getTarget().phd;
        // Cet objet contient les dernier guide step
        this.steps = this.currentStatus.guideSteps;


        new ConfigStore<PhdConfiguration>(appStateManager, 'phd', ['phd', 'configuration'], {
            autorun: false,
            path: null,
            env: {
                DISPLAY: ":0",
                XAUTHORITY: process.env.HOME + "/.Xauthority"
            },
            preferredDithering: defaultDithering(),
        }, {
            autorun: true,
            path: "/path/of/phd2/",
            env: {
                DISPLAY: "Whatever X11 setting required",
                XAUTHORITY: "Whatever other X11 setting required"
            },
            preferredDithering: defaultDithering(),
        }, (c)=>{
            // Ensure dithering is present
            if (!c.preferredDithering) {
                c.preferredDithering = defaultDithering();
            }
            return c;
        });

        this.updateStepsStats();

        new ProcessStarter('phd2', this.currentStatus.configuration);

        // FIXME: handle autoconnect
        this.lifeCycle(CancellationToken.CONTINUE);

        this.appStateManager.addSynchronizer(
            [
                [
                    [   'camera', 'availableDevices'],
                    [   'phd', 'currentEquipment', 'camera' ],
                    [   'phd', 'streamingCamera' ],
                ]
            ], this.updateCaptureStatus, true);
    }

    private startCapture=(device:string)=>{
        createTask<void>(undefined, async(task)=> {
            console.log('Starting phd capture for ' + device);
            this.streamCapture = task;
            this.streamCaptureCanceled = false;
            this.streamCaptureDevice = device;
            this.currentStatus.streamingCamera = device;
            try {
                await this.context.camera.doStream(task.cancellation, device);
            } finally {
                console.log('phd capture for ' + device + ' terminated');
                this.streamCapture = undefined;
                this.streamCaptureCanceled = undefined;
                this.streamCaptureDevice = undefined;
                this.currentStatus.streamingCamera = null;
            }
        });
    }

    private updateCaptureStatus=()=> {
        let wantCaptureDevice:string|undefined;
        if (this.currentStatus.currentEquipment.camera) {
            const camEq = this.currentStatus.currentEquipment.camera;
            if (camEq.connected && this.context.camera.currentStatus.availableDevices.indexOf(camEq.name) !== -1) {
                wantCaptureDevice = camEq.name;
            } else {
                wantCaptureDevice = undefined;
            }
        } else {
            wantCaptureDevice = undefined;
        }

        if (this.streamCaptureDevice !== wantCaptureDevice) {
            if (this.streamCaptureDevice !== undefined) {
                // Cancel current stream capture
                if (!this.streamCaptureCanceled) {
                    this.streamCaptureCanceled = true;
                    console.log('Stopping PHD capture for ' + this.streamCaptureDevice);
                    this.streamCapture!.cancel(new CancellationToken.CancellationError("canceled"));
                }
                return;
            }

            // Start a new streamCapture
            if (wantCaptureDevice !== undefined) {
                this.startCapture(wantCaptureDevice);
            }
        }
    }

    private clearCurrentEquipment = ()=> {
        this.currentStatus.currentEquipment = {};
    }

    private queryCurrentEquipment = async()=> {
        try {
            const ret = await this.sendOrder(CancellationToken.CONTINUE, {
                method: "get_current_equipment",
                params:[]
            });
            this.currentStatus.currentEquipment = ret as PhdStatus["currentEquipment"];
        } catch(e) {
            this.clearCurrentEquipment();
        }
    }

    private clearExposureDurations = ()=> {
        this.currentStatus.exposureDurations = [];
    }

    private queryExposureDurations = async()=> {
        try {
            const ret = await this.sendOrder(CancellationToken.CONTINUE, {
                method: "get_exposure_durations",
                params:[]
            });
            this.currentStatus.exposureDurations = ret as PhdStatus["exposureDurations"];
        } catch(e) {
            this.clearExposureDurations();
        }
    }

    private clearPolledData = ()=> {
        this.clearCurrentEquipment();
        this.clearExposureDurations();
    }

    private polling: boolean = false;

    private pollData = async ()=> {
        if (this.polling) {
            return;
        }
        this.polling = true;
        try {
            await Promise.all([
                    this.queryCurrentEquipment(),
                    this.queryExposureDurations(),
            ]);
        } finally {
            this.polling = false;
        }
    }


    private lifeCycle=async (ct: CancellationToken)=>{
        while(true) {
            try {
                await createTask(ct, (task)=>new Promise(
                    (resolve, reject)=>
                        {
                            let interval : NodeJS.Timeout|undefined;

                            this.clientData = "";
                            this.client = new net.Socket();

                            this.client.on('data', (data)=>{
                                console.log('Received: ' + data);
                                this.clientData += data;
                                this.flushClientData();
                            });

                            this.client.on('error', (e)=> {
                                this.context.notification.error('PHD connection error', e);
                            })

                            this.client.on('close', ()=>{
                                console.log('Phd connection closed');
                                this.client = undefined;
                                if (interval !== undefined) {
                                    clearInterval(interval);
                                    interval = undefined;
                                }

                                this.context.notification.info('PHD connection closed');
                                // FIXME: flushing these messages can lead to change (including reconnection ?)
                                this.flushClientData();

                                var oldPendingRequests = this.pendingRequests;
                                this.pendingRequests = {};
                                for(const k of Object.keys(oldPendingRequests)) {
                                    try {
                                        oldPendingRequests[k].error({message: 'PHD disconnected', disconnected: true});
                                    } catch(e) {
                                        console.warn('Error in PHD request error handler', e);
                                    }
                                }

                                this.clearPolledData();

                                this.currentStatus.star = null;
                                this.currentStatus.AppState = "NotConnected";
                                this.currentStatus.settling = null;

                                this.signalListeners();

                                resolve();
                            });

                            this.client.connect(4400, '127.0.0.1', ()=>{
                                this.context.notification.info('PHD connection established');

                                interval = setInterval(this.pollData, 10000);
                                this.pollData();
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
                if (Obj.hasKey(event, 'Timestamp')) {
                    event.TimeStamp = parseFloat(event.TimeStamp);
                }
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
                        case "Alert":
                            {
                                this.context.notification.info("[PHD] " + event.Type + ": " + event.Msg);
                                this.context.notification.notify("[PHD] " + event.Type + ": " + event.Msg);
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
                        this.context.notification.error('[PHD] ' + order.method + ': '  + err.message);
                        reject(new Error(order.method + ": " +err.message));
                    } else {
                        this.context.notification.error('[PHD] ' + order.method + ' failed');
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

    public dither=async (ct:CancellationToken, settings: DitheringSettings)=>{

        // Il faut attendre un settledone
        await this.sendOrder(ct, {
                method: "dither",
                params:[
                    settings.amount, /* amount */
                    settings.raOnly, /* ra only */
                    {
                        pixels: settings.pixels,
                        time:   settings.time,
                        timeout: settings.timeout
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

    public getAPI = ()=>{
        const ret : RequestHandler.APIAppImplementor<BackOfficeAPI.PhdAPI> = {
            connect: this.connect,
            startGuide: this.startGuide,
            stopGuide: this.stopGuide,

        }
        return ret;
    };

    connect = async(ct:CancellationToken)=>{
        await this.sendOrder(ct, {
            method: "set_connected",
            params: [ true ]
        });
    }

    startGuide = async(ct:CancellationToken)=>{
        await this.connect(ct);

        await this.sendOrder(ct, {
                method: "guide",
                params: [
                    {"pixels": 1.5, "time": 10, "timeout": 60},
                    false
                ]
            });
    }

    stopGuide = async(ct:CancellationToken)=>{
        await this.connect(ct);
        await this.sendOrder(ct, {
                method: 'stop_capture',
            });
    }
}
