import util from 'util';
import fs from 'fs';
import net from 'net';
import CancellationToken from 'cancellationtoken';
import Log from './Log';
import * as Obj from './shared/Obj';
import ConfigStore from './ConfigStore';
import ProcessStarter from './ProcessStarter';
import { ExpressApplication, AppContext } from './ModuleBase.js';
import JsonProxy from './shared/JsonProxy';
import { BackofficeStatus, PhdStatus, PhdGuideStep, PhdSettling, PhdAppState, DitheringSettings, PhdConfiguration, PhdServerConfiguration, PhdGuideStats } from './shared/BackOfficeStatus.js';
import * as Metrics from "./Metrics";
import * as RequestHandler from "./RequestHandler";
import * as BackOfficeAPI from "./shared/BackOfficeAPI";
import * as GuideStats from "./GuideStats";
import Sleep from './Sleep.js';
import { createTask, Task } from './Task.js';
import PhdRpcError from './PhdRpcError.js';
import Notification from './Notification.js';

export type GuideStepListener = (simpleEvent:PhdGuideStep)=>(void);

export type PhdRequest = {
    sent: boolean;
    toSend: string|undefined;
    then: (result: any)=>(void);
    error: (error: any)=>(void);
};

export type Listener = {
    test: ()=>(void);
}

const logger = Log.logger(__filename);

const defaultDithering= ():DitheringSettings => ({
    amount: 1,
    pixels: 0.3,
    raOnly: false,
    time: 10,
    timeout: 60,
});

// Events which alter calibration state
const CalibrationEvents:{[id: string]:boolean} = {
    StartCalibration: true,
    Calibrating: true,
    CalibrationComplete: false,
    CalibrationFailed: false,
};

/* Prevent phd from guiding. Must be closed (end) */
export type PhdGuideInhibiter = {
    start: (ct: CancellationToken)=>Promise<void>;
    end: (ct: CancellationToken)=>Promise<void>;
}

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
    private inhibiters : Map<string, PhdGuideInhibiter>;
    private inhibiterId : number = 0;
    // Currently running pause / unpause promise
    private pausePromise: Promise<void>|undefined = undefined;

    constructor(app:ExpressApplication, appStateManager:JsonProxy<BackofficeStatus>, context: AppContext)
    {
        this.appStateManager = appStateManager;
        this.context= context;
        this.running = true;
        this.stepId = 0;
        this.reqId = 0;

        this.clientData = "";
        this.inhibiters = new Map();

        this.appStateManager.getTarget().phd = {
            // Connecting
            phd_started: false,

            connected: false,

            AppState: "NotConnected",
            AppStateProgress: null,
            paused: null,
            // null until known
            settling: null,

            guideSteps: {},
            configuration: {
                autorun: false,
                path: null,
                env: {},
                preferredDithering: defaultDithering(),
            },
            serverConfiguration: null,
            firstStepOfRun: this.stepIdToUid(this.stepId),

            RADistanceRMS:null,
            DECDistanceRMS:null,
            RADECDistanceRMS:null,
            RADistancePeak: null,
            DECDistancePeak: null,
            RADECDistancePeak: null,
            star:null,
            currentEquipment: {},
            exposure: null,
            exposureDurations: [],
            calibration: null,
            pixelScale: null,
            streamingCamera: null,
            lockPosition: null,
            lastLockedPosition: null,
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
                    [   'indiManager', 'availableCameras'],
                    [   'phd', 'currentEquipment', 'camera' ],
                    [   'phd', 'streamingCamera' ],
                    [   'phd', 'AppState' ],
                ]
            ], this.updateCaptureStatus, true);
        this.appStateManager.addSynchronizer(
            [   'phd', 'serverConfiguration' ],
            this.checkPhdWarning, true);
    }

    private startCapture=(device:string)=>{
        createTask<void>(undefined, async(task)=> {
            logger.info('Starting phd capture', {device});
            this.streamCapture = task;
            this.streamCaptureCanceled = false;
            this.streamCaptureDevice = device;
            this.currentStatus.streamingCamera = device;
            try {
                const imagingSetups = this.context.imagingSetupManager
                            .getUuids()
                            .filter((uuid)=> {
                                const is = this.context.imagingSetupManager.getImagingSetupInstance(uuid);
                                return device === is?.config().cameraDevice;
                            })
                if (imagingSetups.length === 0) {
                    throw new Error("No imaging setup found for PHD camera: " + device);
                }
                await this.context.camera.doStream(task.cancellation, imagingSetups[0], false);
            } catch(e) {
                if (!(e instanceof CancellationToken.CancellationError)) {
                    logger.warn('phd capture failed', {device}, e);
                    try {
                        await Sleep(task.cancellation, 2000);
                    } catch(e) {
                    }
                }
            } finally {
                logger.info('phd capture terminated', {device});
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
            const name = (camEq.name || "").replace(/^INDI Camera \[(.*)\]$/, "$1");
            if (this.context.indiManager.currentStatus.availableCameras.indexOf(name) !== -1) {
                if (Obj.hasKey(this.context.camera.currentStatus.dynStateByDevices, name)) {
                    this.context.camera.currentStatus.dynStateByDevices[name].spyRecommanded = true;
                }
                if (camEq.connected) {
                    switch(this.currentStatus.AppState) {
                        case "Paused":
                        case "Stopped":
                        case "NotConnected":
                            logger.debug('PHD not capturing');
                            break;
                        default:
                            wantCaptureDevice = name;
                    }
                } else {
                    logger.debug('PHD camera not connected');
                }
            } else {
                logger.debug('PHD camera not available');
                wantCaptureDevice = undefined;
            }
        } else {
            logger.debug('PHD has no camera');
            wantCaptureDevice = undefined;
        }

        if (this.streamCaptureDevice !== wantCaptureDevice) {
            if (this.streamCaptureDevice !== undefined) {
                // Cancel current stream capture
                if (!this.streamCaptureCanceled) {
                    this.streamCaptureCanceled = true;
                    logger.info('Stopping PHD capture', {streamCaptureDevice: this.streamCaptureDevice});
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

    private queryPauseStatus = async(ct:CancellationToken)=> {
        try {
            const ret = await this.sendOrder(CancellationToken.CONTINUE, {
                method: "get_paused",
                params:[]
            });

            if (ret !== this.currentStatus.paused) {
                logger.info("Get paused returned", ret);
            }
            this.currentStatus.paused = !!ret;
        } catch(e) {
            if (!(e instanceof CancellationToken.CancellationError)) {
                this.currentStatus.paused = null;
            }
        }
    }

    private clearCalibrationData = ()=> {
        this.currentStatus.calibration = null;
    }

    private queryCalibration = async (ct:CancellationToken)=> {
        try {
            const ret = await this.sendOrder(CancellationToken.CONTINUE, {
                method: "get_calibration_data",
                params:[]
            });
            if (!Obj.deepEqual(ret, this.currentStatus.calibration)) {
                logger.info('calibration data is ', ret);
                this.currentStatus.calibration = ret as PhdStatus["calibration"];
            }
        } catch(e) {
            if (!(e instanceof CancellationToken.CancellationError)) {
                this.clearCalibrationData();
            }
        }
    }

    private queryPixelScale = async(ct:CancellationToken)=> {
        try {
            const ret = await this.sendOrder(CancellationToken.CONTINUE, {
                method: "get_pixel_scale",
                params:[]
            });
            if (!Obj.deepEqual(ret, this.currentStatus.pixelScale)) {
                logger.info('Pixel scale change detected: ', ret);
                this.currentStatus.pixelScale = ret as PhdStatus["pixelScale"];
            }
        } catch(e) {
            if (!(e instanceof CancellationToken.CancellationError)) {
                this.clearCalibrationData();
            }
        }
    }

    private clearCurrentEquipment = ()=> {
        this.currentStatus.currentEquipment = {};
    }

    private queryCurrentEquipment = async(ct:CancellationToken)=> {
        try {
            const ret = await this.sendOrder(CancellationToken.CONTINUE, {
                method: "get_current_equipment",
                params:[]
            });
            this.currentStatus.currentEquipment = ret as PhdStatus["currentEquipment"];
        } catch(e) {
            if (!(e instanceof CancellationToken.CancellationError)) {
                this.clearCurrentEquipment();
            }
        }
    }

    private clearExposureDurations = ()=> {
        this.currentStatus.exposureDurations = [];
    }

    private queryExposureDurations = async(ct:CancellationToken)=> {
        try {
            const ret = await this.sendOrder(ct, {
                method: "get_exposure_durations",
                params:[]
            });
            this.currentStatus.exposureDurations = ret as PhdStatus["exposureDurations"];
        } catch(e) {
            if (!(e instanceof CancellationToken.CancellationError)) {
                this.clearExposureDurations();
            }
        }
    }

    private clearExposure = ()=> {
        this.currentStatus.exposure = null;
    }

    private queryExposure = async(ct:CancellationToken)=> {
        try {
            const ret = await this.sendOrder(ct, {
                method: "get_exposure",
                params:[]
            });
            this.currentStatus.exposure = ret as PhdStatus["exposure"];
        } catch(e) {
            if (!(e instanceof CancellationToken.CancellationError)) {
                this.clearExposure();
            }
        }
    }

    private clearLockPosition = ()=>{
        this.currentStatus.lockPosition = null;
    }

    private queryLockPosition = async(ct:CancellationToken)=>{
        try {
            const ret = await this.sendOrder(ct, {
                method: "get_lock_position",
                params:[]
            }) as null|number[];
            this.currentStatus.lockPosition=ret === null ? null : {x: ret[0], y:ret[1]};
            if (ret !== null) {
                this.currentStatus.lastLockedPosition = {x: ret[0], y: ret[1]};
            }
        } catch(e) {
            if (!(e instanceof CancellationToken.CancellationError)) {
                this.clearLockPosition();
            }
        }
    }

    private clearServerConfiguration = ()=>{
        this.currentStatus.serverConfiguration = null;
    }

    private parseServerConfiguration(contentStr: string): PhdServerConfiguration {
        const ret: PhdServerConfiguration = {};
        const content = contentStr.split(/[\n\r]+/);

        if (content.length < 1) {
            throw new Error("Invalid PHD config file");
        }
        if (content[0] !== 'PHD Config 1') {
            logger.error('Encountered invalid config header', {header: content[0]});
            throw new Error("Invalid PHD config format");
        }

        for(let i = 1; i < content.length; ++i) {
            const line = content[i];
            if (line === '') {
                continue;
            }
            const [key, type, val] = line.split(/\t/g);
            const keyParts = key.split(/\//g).map(s=>s.toLowerCase());
            if (keyParts.length < 2 || keyParts[0] !== '') {
                logger.error('encountered invalid config key', {key});
                throw new Error('Invalid PHD config key');
            }
            let parent = ret;

            for(let i = 1; i < keyParts.length - 1; ++i) {
                const k = keyParts[i];
                if (!Obj.hasKey(parent, k)) {
                    parent[k] = {
                    }
                }
                if (!parent[k].props) {
                    parent[k].props = {};
                }
                parent = parent[k].props!;
            }

            const k = keyParts[keyParts.length - 1];
            if (!Obj.hasKey(parent, k)) {
                parent[k] = {};
            }
            switch(type) {
                case '1': // string
                    parent[k].val = "" + val;
                    break;
                case '2': // boolean
                    parent[k].val = "" + val;
                    break;
                case '3': // int
                    parent[k].val = "" + val;
                    break;
                case '4': // float
                    parent[k].val = "" + val;
                    break;
                default:
                    this.context.notification.info('[PHD] ignoring unsupported key type for ' + key);
                    break;
            }
        }

        return ret;
    }

    private queryServerConfigurationTask: null|Task<void> = null;

    private refreshServerConfiguration = async()=> {
        const conn = this.client;
        if (this.queryServerConfigurationTask !== null) {
            try {
                await this.queryServerConfigurationTask;
            } finally {
            }
        }
        if (this.client !== conn) {
            logger.info("No re-reading configuration after conn drop");
            return;
        }
        await this.queryServerConfiguration();
    }

    private queryServerConfiguration = async()=>{
        if (this.queryServerConfigurationTask !== null) {
            await this.queryServerConfigurationTask;
            return;
        }

        const newTask = createTask(CancellationToken.CONTINUE, async (task:Task<void>)=> {
            this.queryServerConfigurationTask = task;
            try {
                const ret = await this.sendOrder(task.cancellation, {
                    method: "export_config_settings",
                    params: []
                }) as {filename: string};
                logger.info('Reading config file', {filename: ret.filename});
                task.cancellation.throwIfCancelled();
                const content = await util.promisify(fs.readFile)(ret.filename, {encoding: 'utf8'})
                task.cancellation.throwIfCancelled();
                if (this.queryServerConfigurationTask === task) {
                    this.currentStatus.serverConfiguration = this.parseServerConfiguration(content);
                    logger.info('Configuration updated', this.currentStatus.serverConfiguration);
                }
            } catch(e) {
                if (!(e instanceof CancellationToken.CancellationError)) {
                    if (this.queryServerConfigurationTask === task) {
                        this.clearServerConfiguration();
                        this.context.notification.error('[PHD] could not read configuration', e);
                    }
                }
            } finally {
                if (this.queryServerConfigurationTask === task) {
                    this.queryServerConfigurationTask = null;
                }
            }
        });

        await newTask;
    }

    private lastPhdWarning: string|undefined|null = null;

    private recheckPhdWarning = ()=> {
        const serverConfiguration = this.currentStatus.serverConfiguration;
        if (serverConfiguration === null) {
            return;
        }
        try {
            const currentProfileId = serverConfiguration.currentprofile.val!;
            const currentProfile = serverConfiguration.profile.props![currentProfileId].props!;

            const camName = currentProfile.camera.props?.lastmenuchoice?.val;
            if (!camName) {
                // May occur during phd initial config
                return;
            }
            logger.debug('Found camName', {camName});

            const up2date = currentProfile.indi && currentProfile.indi.props!.indicam_forceexposure;

            if ((!currentProfile.indi) || (!camName.match(/^INDI Camera \[.*\]$/))) {
                return "PHD frame display only works for INDI camera. Please update PHD configuration to use the INDI driver for camera"
                    + (!up2date? " and check you use a recent PHD version." : ".");
            }
            if (!up2date) {
                return "PHD version is not fully supported. Please update to use a more recent PHD version";
            }
            if (currentProfile.indi.props!.indicam_forceexposure.val! === "0"
                || currentProfile.indi.props!.indicam_forcevideo && currentProfile.indi.props!.indicam_forcevideo.val === "1") {
                return "PHD frame display works better with INDI camera in exposure mode only. Please update PHD configuration of camera to use exposure only";
            }

            return undefined;
        } catch(e) {
            this.context.notification.error('[PHD] Error verifying configuration', e);
            return "PHD configuration could not be verified. Please ensure PHD profile is valid and check you use a recent PHD version";
        }
    }

    private checkPhdWarning = ()=> {
        if (this.currentStatus.serverConfiguration === null) {
            return;
        }
        const warning = this.recheckPhdWarning();
        if (warning === this.lastPhdWarning) {
            return;
        }
        this.lastPhdWarning = warning;
        if (warning === undefined) {
            this.context.notification.info('[PHD] Configuration seems good !');
            return;
        }
        this.context.notification.info(warning);
        this.context.notification.notify(warning);
    }

    private clearPolledData = ()=> {
        this.clearCalibrationData();
        this.clearExposure();
        this.clearCurrentEquipment();
        this.clearExposureDurations();
        this.clearLockPosition();
    }

    private polling: boolean = false;

    private pollData = async ()=> {
        if (this.polling) {
            return;
        }
        this.polling = true;
        try {
            await Promise.all([
                    this.queryPauseStatus(CancellationToken.CONTINUE),
                    this.queryCurrentEquipment(CancellationToken.CONTINUE),
                    this.queryExposureDurations(CancellationToken.CONTINUE),
                    this.queryExposure(CancellationToken.CONTINUE),
                    this.queryCalibration(CancellationToken.CONTINUE),
                    this.queryLockPosition(CancellationToken.CONTINUE),
                    this.queryPixelScale(CancellationToken.CONTINUE),
            ]);
        } finally {
            this.polling = false;
        }
    }


    private lifeCycle=async (ct: CancellationToken)=>{
        let connRefusedNotified: boolean = false;
        while(true) {
            try {
                await createTask(ct, (task)=>new Promise(
                    (resolve, reject)=>
                        {
                            let interval : NodeJS.Timeout|undefined;
                            let silentError: boolean|undefined = undefined;

                            this.clientData = "";
                            this.client = new net.Socket();
                            this.parallelMode = false;
                            this.client.on('data', (data)=>{
                                logger.debug('Received: ' + data);
                                this.clientData += data;
                                this.flushClientData();
                            });

                            this.client.on('error', (e)=> {
                                if ((connRefusedNotified) && silentError === undefined && (e as any).code === 'ECONNREFUSED') {
                                    silentError = true;
                                    logger.warn('PHD connection refused');
                                } else {
                                    connRefusedNotified = ((e as any).code === 'ECONNREFUSED');
                                    logger.error('PHD connection error', e);
                                }
                                if (!silentError) {
                                    this.context.notification.error('PHD connection error', e);
                                }
                            })

                            this.client.on('close', ()=>{
                                if (!silentError) {
                                    logger.warn('Phd connection closed');
                                }
                                this.client = undefined;
                                if (interval !== undefined) {
                                    clearInterval(interval);
                                    interval = undefined;
                                }

                                if (!silentError) {
                                    this.context.notification.info('PHD connection closed');
                                }
                                // FIXME: flushing these messages can lead to change (including reconnection ?)
                                this.flushClientData();

                                if (this.queryServerConfigurationTask !== null) {
                                    const deadTask = this.queryServerConfigurationTask;
                                    this.queryServerConfigurationTask = null;
                                    deadTask.cancel(new CancellationToken.CancellationError("connection closed"));
                                }

                                this.runningRequest = 0;
                                this.writePendingRequest = [];
                                var oldPendingRequests = this.pendingRequests;
                                this.pendingRequests = {};
                                for(const k of Object.keys(oldPendingRequests)) {
                                    try {
                                        oldPendingRequests[k].error({message: 'PHD disconnected', disconnected: true});
                                    } catch(e) {
                                        logger.error('Error in PHD request error handler', e);
                                    }
                                }

                                this.clearPolledData();
                                this.clearServerConfiguration();

                                this.currentStatus.star = null;
                                this.currentStatus.AppState = "NotConnected";
                                this.currentStatus.AppStateProgress = null;
                                this.currentStatus.connected = false;
                                this.currentStatus.paused = null;
                                this.currentStatus.settling = null;

                                this.signalListeners();

                                resolve(undefined);
                            });

                            this.client.connect(4400, '127.0.0.1', ()=>{
                                this.context.notification.info('PHD connection established');
                                silentError = false;
                                connRefusedNotified = false;
                                
                                interval = setInterval(this.pollData, 10000);
                                this.queryServerConfiguration();
                                this.pollData();
                            });

                            task.cancellation.onCancelled(()=> {
                                this.client!.destroy();
                            });
                        }
                ));
            } catch(e) {
                logger.error("Phd error", e);
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
        const minUid = this.currentStatus.firstStepOfRun;
        const steps = Object.keys(this.steps).filter((uid)=>uid >= minUid).map(uid=>this.steps[uid])

        Object.assign(this.currentStatus, GuideStats.computeGuideStats(steps));
    }

    signalListeners() {
        for(var k of Object.keys(this.eventListeners)) {
            if (Obj.hasKey(this.eventListeners, k)) {
                this.eventListeners[k].test();
            }
        }
    }

    private listeners:{[id:string]:GuideStepListener} = {};
    private listenerId:number = 0;

    public listenForSteps= (listener:(simpleEvent:PhdGuideStep)=>(void)):()=>(void)=>{
        const nextId = "" + (this.listenerId++);
        this.listeners[nextId] = listener;
        return ()=>{
            delete this.listeners[nextId];
        }
    }

    pushStep(simpleEvent:PhdGuideStep) {
        logger.info('Push step', {step: simpleEvent});
        this.stepId++;
        if (this.stepId > 400) {
            delete this.steps[this.stepIdToUid(this.stepId - 400)];
        }
        this.steps[this.stepIdToUid(this.stepId)] = simpleEvent;
        this.updateStepsStats();

        for(const listener of Object.values(this.listeners)) {
            listener(simpleEvent);
        }
    }

    flushClientData()
    {
        // FIXME: consume datas.
        var cutAt;
        while((cutAt = this.clientData.indexOf("\r\n")) != -1)
        {
            var data = this.clientData.substr(0, cutAt);
            this.clientData = this.clientData.substr(cutAt + 2);
            logger.debug('Received json', data);
            var statusUpdated = false;
            try {
                // Quickfix for https://github.com/OpenPHDGuiding/phd2/issues/776
                if (data.indexOf('\n') !== -1) {
                    logger.debug('Received incorrect json. Patching');
                    data = data.replace(/\n/g, ' ');
                }
                var event = JSON.parse(data);
                if (Obj.hasKey(event, 'Timestamp')) {
                    event.Timestamp = parseFloat(event.Timestamp);
                }
                if ("Event" in event) {
                    const eventToStatus:{[id:string]:PhdAppState} = {
                        "StartGuiding":             "Guiding",
                        "GuideStep":                "Guiding",
                        "StartCalibration":         "Calibrating",
                        "LoopingExposures":         "Looping",
                        "LoopingExposuresStopped":  "Stopped",
                        "StarLost":                 "LostLock"
                    };
                    logger.info('Event', {event});
                    switch (event.Event) {
                        case "Version":
                            {
                                this.parallelMode = !!event.OverlapSupport;
                                if (this.parallelMode) {
                                    while(this.sendWritePendingRequest()) {
                                    }
                                }
                                break;
                            }
                        case "AppState":
                            this.currentStatus.connected = true;
                            if (event.State !== this.currentStatus.AppState) {
                                this.currentStatus.AppState = event.State;
                                this.currentStatus.AppStateProgress = null;
                            }
                            this.currentStatus.star = null;
                            this.currentStatus.settling = null;
                            this.currentStatus.paused = null;
                            logger.debug('Initial status', {AppState: this.currentStatus.AppState});
                            break;
                        case "Paused":
                            this.currentStatus.paused = true;
                            break;
                        case "Resumed":
                            this.currentStatus.paused = false;
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
                                logger.debug('settledone', {newStatus});
                                this.currentStatus.settling = newStatus;
                                break;
                            }
                        case "Alert":
                            {
                                this.context.notification.info("[PHD] " + event.Type + ": " + event.Msg);
                                this.context.notification.notify("[PHD] " + event.Type + ": " + event.Msg);
                                break;
                            }
                        case "LockPositionLost":
                            {
                                this.clearLockPosition();
                                break;
                            }
                        case "LockPositionSet":
                            {
                                this.currentStatus.lockPosition = {
                                    x: event.X,
                                    y: event.Y,
                                }
                                this.currentStatus.lastLockedPosition = {
                                    x: event.X,
                                    y: event.Y,
                                }
                                break;
                            }
                        case "ConfigurationChange":
                            {
                                // Starts an async refresh of configuration
                                this.refreshServerConfiguration();
                                this.queryPixelScale(CancellationToken.CONTINUE);
                                break;
                            }
                        default:
                            if (event.Event in eventToStatus) {
                                var newStatus = eventToStatus[event.Event];
                                var oldStatus = this.currentStatus.AppState;
                                if (oldStatus != newStatus) {
                                    this.currentStatus.star = null;
                                    this.currentStatus.AppState = newStatus;
                                    this.currentStatus.AppStateProgress = null;
                                    if (newStatus == 'Guiding' && oldStatus != 'Paused' && oldStatus != 'LostLock') {
                                        this.currentStatus.firstStepOfRun = this.stepIdToUid(this.stepId + 1);
                                        this.updateStepsStats();
                                    }
                                    logger.debug('New status', {AppState: this.currentStatus.AppState});
                                    if (newStatus != 'Guiding' && newStatus != 'LostLock') {
                                        this.currentStatus.settling = null;
                                    }
                                }
                            }
                            if (event.Event === 'Calibrating') {
                                this.currentStatus.AppStateProgress = event.State || null;
                            } else {
                                this.currentStatus.AppStateProgress = null;
                            }
                    };
                    if ((event.Event == "Paused") || (event.Event == "LoopingExposuresStopped")) {
                        // Push an empty step, to cause interruption in the guiding graph
                        this.pushStep({
                            Timestamp: event.Timestamp,
                            settling: false
                        });
                    }

                    if (event.Event === "StarLost") {
                        this.clearLockPosition();
                    }
                    
                    if (event.Event === "LoopingExposures") {
                        this.pushStep({
                            Timestamp: event.Timestamp,
                            settling: false
                        });
                    }
                    if (event.Event === "SettleBegin") {
                        this.pushStep({
                            Timestamp: event.Timestamp,
                            settling: true
                        });
                    }

                    if (Object.prototype.hasOwnProperty.call(CalibrationEvents, event.Event)) {
                        const calibrating = CalibrationEvents[event.Event];
                        this.clearCalibrationData();
                        if (!calibrating) {
                            this.queryCalibration(CancellationToken.CONTINUE);
                        }
                        this.pushStep({
                            Timestamp: event.Timestamp,
                            calibrating: calibrating,
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


                        const rawEvent = Object.assign({}, event);
                        delete rawEvent.Event;
                        delete rawEvent.Host;
                        delete rawEvent.Inst;
                        delete rawEvent.Mount;
                        const simpleEvent : PhdGuideStep = rawEvent;

                        if ((simpleEvent.RADistanceRaw !== undefined) &&
                            (simpleEvent.DECDistanceRaw !== undefined)) {
                            let scale;
                            if (this.currentStatus.pixelScale === null) {
                                // FIXME: alert
                                logger.warn('Pixel scale invalid. 1 is assumed');
                                scale = 1;
                            } else {
                                scale = this.currentStatus.pixelScale;
                            }

                            simpleEvent.RADistance = simpleEvent.RADistanceRaw * scale;
                            simpleEvent.DECDistance = simpleEvent.DECDistanceRaw * scale;
                        } else {
                            simpleEvent.RADistance = undefined;
                            simpleEvent.DECDistance = undefined;
                        }

                        simpleEvent.settling = this.currentStatus.settling.running;
                        this.pushStep(simpleEvent);
                    }

                    if (this.inhibiters.size && !this.pausePromise && !this.currentStatus.paused) {
                        logger.info("Pausing phd guiding from status", this.currentStatus.AppState);
                        this.setPaused(CancellationToken.CONTINUE, true);
                    }

                    this.signalListeners();
                } else if ("jsonrpc" in event) {
                    var id = event.id;
                    if (Object.prototype.hasOwnProperty.call(this.pendingRequests, id)) {
                        const doneRequest = this.pendingRequests[id];
                        delete this.pendingRequests[id];
                        this.runningRequest--;
                        this.sendWritePendingRequest();
                        try {
                            if (Object.prototype.hasOwnProperty.call(event, 'error')) {
                                doneRequest.error(event.error);
                            } else {
                                doneRequest.then(event.result);
                            }
                        }catch(e) {
                            logger.error('Phd request callback error', e);
                        }
                    }
                }
            }catch(e) {
                logger.error('Phd error', e);
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

    async sendOrderWithFailureLog(ct: CancellationToken, order: any) {
        try {
            return await this.sendOrder(ct, order);
        } catch(e) {
            if (!(e instanceof CancellationToken.CancellationError)) {
                logger.error(`${order.method} failed`, e);
                this.context.notification.error('[PHD] ' + ((e as any).message || e));
            }
            throw e;
        }
    }

    private parallelMode: boolean = false;
    private runningRequest: number = 0;
    private writePendingRequest: Array<PhdRequest> = [];

    private activateRequest(r: PhdRequest)
    {
        this.writePendingRequest.push(r);
        if (this.parallelMode || this.runningRequest === 0) {
            this.sendWritePendingRequest();
        } else {
            logger.debug('Queued JSONRPC request');
        }
    }

    private sendWritePendingRequest() {
        if (this.writePendingRequest.length === 0) {
            return false;
        }
        const req = this.writePendingRequest.splice(0, 1)[0];
        req.sent = true;
        this.runningRequest++;
        logger.debug('Pushing JSONRPC request', {toSend: req.toSend});
        this.client!.write(req.toSend + "\r\n");
        req.toSend = "";
        return true;
    }

    // Return a promise that send the order (generator) and waits for a result
    async sendOrder(ct:CancellationToken, order:any) {
        return await new Promise((resolve, reject)=> {
            let uid:string|undefined;
            let ctCb: (()=>(void))|undefined;
            let newRequest:PhdRequest;

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
                if (!newRequest.sent) {
                    // Remove from writePendingRequest
                    const p = this.writePendingRequest.indexOf(newRequest);
                    if (p !== -1) {
                        this.writePendingRequest.splice(p, 1);
                    }
                }
                return false;
            }
            if (this.client === undefined) {
                throw "PHD not connected";
            }
            uid = "" + this.reqId++;
            order = {...order, id: uid};

            newRequest = {
                toSend: JSON.stringify(order),
                sent: false,
                then: (rslt)=>{
                    unregister();
                    resolve(rslt);
                },
                error: (err)=>{
                    unregister();
                    reject(new PhdRpcError(order.method, err));
                },
            };
            this.pendingRequests[uid] = newRequest;
            this.activateRequest(newRequest);
            ctCb = ct.onCancelled((reason)=>{
                unregister();
                reject(new CancellationToken.CancellationError(reason));
            });
        });
    }

    public dither=async (ct:CancellationToken, settings: DitheringSettings)=>{

        // Il faut attendre un settledone
        await this.sendOrderWithFailureLog(ct, {
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
                logger.warn("PHD: not settling after dither ?");
                return false;
            });
    }

    public getAPI = ()=>{
        const ret : RequestHandler.APIAppImplementor<BackOfficeAPI.PhdAPI> = {
            connect: this.connect,
            startLoop: this.startLoop,
            startGuide: this.startGuide,
            stopGuide: this.stopGuide,
            setExposure: this.setExposure,
            setLockPosition: this.setLockPosition,
            findStar: this.findStar,
            clearCalibration: this.clearCalibration,
        }
        return ret;
    };

    public async metrics():Promise<Array<Metrics.Definition>> {
        let ret : Array<Metrics.Definition> = [];
        ret.push({
            name: 'phd_connection',
            help: 'is connection to phd established',
            type: 'gauge',
            value: (this.currentStatus.connected) ? 1 : 0,
        });

        if (this.currentStatus.connected) {
            // Report the status
            ret.push({
                name: 'phd_app_state',
                help: 'status of PHD',
            });
            for(const state of ["NotConnected" , "Guiding" , "Paused" , "Calibrating" , "Looping" , "Stopped" , "LostLock"]) {

                ret.push({
                    name: 'phd_app_state',
                    labels: {state},
                    type: 'gauge',
                    value: (this.currentStatus.AppState == state) ? 1 : 0,
                });
            }

        }
        // FIXME: report the sum of delta and guiding count... Possible?

        // FIXME: report the sum of delta and settled count... Possible?
        // (sum delta x, delta x², delta y, delta y², correctionx, correctiony, and number of images)

        return ret;
    }

    connect = async(ct:CancellationToken)=>{
        await this.sendOrderWithFailureLog(ct, {
            method: "set_connected",
            params: [ true ]
        });
        await this.queryExposure(ct);
        await this.queryPixelScale(ct);
    }

    setPaused = async(ct: CancellationToken, paused: boolean)=> {
        while (this.pausePromise) {
            ct.throwIfCancelled();
            try {
                await this.pausePromise;
            } catch(e) {}
        }

        const promise = (async ()=> {
            // This allows promise to be set to this before continuing
            await (async()=>{})();
            try {
                logger.info("Before (un)pausing phd", {want: paused, currentStatus: this.currentStatus});
                await this.sendOrderWithFailureLog(ct, {
                    method: 'set_paused',
                    params: [ paused ]
                });
                logger.info("After (un)pausing phd", {want: paused, currentStatus: this.currentStatus});
            } finally {
                this.pausePromise = undefined;
            }
        })();
        this.pausePromise = promise;
        await promise;
    }

    createInhibiter = () => {
        const disablerId = "" + (this.inhibiterId++);
        let started : boolean = false;
        let stopped : boolean = false;
        const inhibiter:PhdGuideInhibiter = {
            end: async (ct: CancellationToken)=>{
                if (!started) {
                    return;
                }
                if (stopped) {
                    return;
                }
                stopped = true;
                if (!this.inhibiters.has(disablerId)) {
                    return ;
                }
                this.inhibiters.delete(disablerId);
                if (this.inhibiters.size) {
                    // Exit possibility here. May return before actual end - but it's ongoing anyway
                    return ;
                }
                if (this.currentStatus.connected && this.currentStatus.paused) {
                    logger.info("Phd guiding will be unpaused");
                    // Remark: the unpause should be cancelable, but interrupting it would leave phd in paused status
                    await this.setPaused(CancellationToken.CONTINUE, false);
                }
            },
            start: async (ct: CancellationToken)=>{
                if (started) {
                    return;
                }
                started = true;
                do {
                    // Do we need to pause ?
                    if (this.inhibiters.size) {
                        this.inhibiters.set(disablerId, inhibiter);
                        return ;
                    }

                    await this.pausePromise;
                } while(this.pausePromise);
                ct.throwIfCancelled();

                this.inhibiters.set(disablerId, inhibiter);
                if (this.currentStatus.connected && !this.currentStatus.paused) {
                    // Making this interruptible may leave phd state random
                    await this.setPaused(CancellationToken.CONTINUE, true);
                }
            }
        };

        return inhibiter;
    }

    startLoop = async(ct: CancellationToken)=>{
        await this.connect(ct);
        await this.sendOrderWithFailureLog(ct, {
            method: "loop",
            params: []
        });
    }

    startGuide = async(ct:CancellationToken)=>{
        await this.connect(ct);
        
        await this.sendOrderWithFailureLog(ct, {
                method: "guide",
                params: [
                    {"pixels": 1.5, "time": 10, "timeout": 60},
                    false
                ]
            });
        // Discard all disablers
        this.inhibiters.clear();
        // Remark: the unpause should be cancelable, but interrupting it would leave phd in paused status
        await this.setPaused(CancellationToken.CONTINUE, false);
    }

    stopGuide = async(ct:CancellationToken)=>{
        await this.sendOrderWithFailureLog(ct, {
                method: 'stop_capture',
            });
    }

    setExposure = async(ct:CancellationToken, payload: {exposure: number})=>{
        await this.sendOrderWithFailureLog(ct, {
                method: 'set_exposure',
                params: [ payload.exposure ]
            });
        await this.queryExposure(ct);
    }

    clearCalibration = async(ct:CancellationToken, payload: {})=>{
        await this.sendOrderWithFailureLog(ct, {
                method: 'clear_calibration',
            });
        await this.queryCalibration(ct);
    }

    setLockPosition = async(ct: CancellationToken, payload: { x: number, y:number, exact: boolean})=>{
        await this.sendOrderWithFailureLog(ct, {
                method: 'set_lock_position',
                params: [payload.x, payload.y, payload.exact],
            });
    }

    findStar = async(ct: CancellationToken, payload: {roi?:  Array<number>}) => {
        const params = [];
        if (payload.roi) {
            params.push(payload.roi);
        }
        await this.sendOrderWithFailureLog(ct, {
            method: 'find_star',
            params
        });
    }
}
