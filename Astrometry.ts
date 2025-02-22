import CancellationToken from 'cancellationtoken';
import Log from './Log';
import Sleep from './Sleep';
import * as BackOfficeAPI from './shared/BackOfficeAPI';
import * as RequestHandler from './RequestHandler';
import ConfigStore from './ConfigStore';
import { ExpressApplication, AppContext } from "./ModuleBase";
import { AstrometryStatus, BackofficeStatus, AstrometryWizard, AstrometrySettings, FineSlewLearning, SlewCalibrationVector, ImageStatus, PolarAlignAxisSettings } from './shared/BackOfficeStatus';
import { AstrometryResult, ProcessorAstrometryConstraints, ProcessorAstrometryRequest } from './shared/ProcessorTypes';
import JsonProxy from './shared/JsonProxy';
import { IndiConnection } from './Indi';
import SkyProjection from './SkyAlgorithms/SkyProjection';
import {Task, createTask} from "./Task";
import Wizard from "./Wizard";
import PolarAlignmentWizard from "./PolarAlignmentWizard";
import MeridianFlipWizard from './MeridianFlipWizard';

const logger = Log.logger(__filename);

export const defaultAxis = ():PolarAlignAxisSettings=> ({
    axisTurnPerMovedDegree: null,
    screwLabelStraight: "clockwise",
    screwLabelReverse: "counter-clockwise",
});

const defaultSettings = ():AstrometrySettings=> ({
    initialFieldMin: 0.2,
    initialFieldMax: 5,
    useMountPosition: true,
    initialSearchRadius: 30,
    narrowedSearchRadius: 4,
    narrowedFieldPercent: 25,
    polarAlign: {
        slewRate: "SLEW_FIND",
        sampleCount: 5,
        angle: 60,
        minAltitude: 10,
        alt: defaultAxis(),
        az: defaultAxis(),
    },
    meridianFlip: {
        clearPhdCalibration: false,
    },
    preferedScope: null,
    preferedImagingSetup: null,
    fineSlew: {
        slewRate: ""
    }
});

class SlewAxisStatus {
    direction: BackOfficeAPI.SlewDirection;
    astrometry: Astrometry;
    expiration: number;
    task?: Task<void>;
    taskInterrupted?: boolean;
    watchTimeout?: NodeJS.Timeout;
    indiVector: string;
    indiProperty: string;

    elapsed: number;
    lastStart: number|undefined;

    constructor(astrometry: Astrometry, direction: BackOfficeAPI.SlewDirection, indiVector: string, indiProperty: string)
    {
        this.astrometry = astrometry;
        this.direction = direction;
        this.expiration = 0;
        this.indiVector = indiVector;
        this.indiProperty = indiProperty;
        this.elapsed = 0;
    }

    flushElapsed = () => {
        if (this.lastStart === undefined) {
            return;
        }

        const now = Date.now();
        const duration = now - this.lastStart;
        if (duration > 0) {
            this.elapsed += duration;
            this.lastStart = now;
        }
    }

    directSlew = async (ct: CancellationToken, duration: number) => {
        const start = Date.now();

        const scope = this.astrometry.currentStatus.selectedScope;
        if (!scope) {
            throw new Error("No scope selected");
        }

        // TODO: set slewRate ? Would conflict. Responsability of caller
        // const slewRate = this.astrometry.currentStatus.settings.fineSlew.slewRate;

        const motion = createTask<void>(ct, async (task)=> {
            await this.astrometry.indiManager.pulseParam(task.cancellation, scope, this.indiVector, this.indiProperty);
        });
        const pilot = createTask<void>(ct, async (task)=> {
            logger.debug('Pilot task started', this.direction);
            await Sleep(task.cancellation, duration);
            logger.info('Pilot task finished', this.direction);
        });

        // FIXME: if parent token was interrupted...
        let error = undefined;
        try {
            motion.catch((e)=>pilot.cancel());
            pilot.catch((e)=>motion.cancel());
            await pilot;
            logger.info('Done with pilot task', this.direction);
        } catch(e) {
            logger.debug('Catched pilot task catched', this.direction, e);
            if (!(e instanceof CancellationToken.CancellationError)) {
                logger.error("Pulse pilot failed", this.direction, e);
                error = e;
            } else {
                logger.debug("Pilot task interrupted", this.direction);
            }
        } finally {
            try {
                logger.info('Stoping motion task', this.direction);
                motion.cancel();
                await motion
                logger.warn('Motion task done (?)', this.direction);
            } catch(e) {
                logger.debug('Motion task catched', this.direction, e);
                if (!(e instanceof CancellationToken.CancellationError)) {
                    logger.error("Motion failed", this.direction, e);
                    error = e;
                }
            }
        };
        if (error) {
            throw error;
        }
    }

    awake = (newExpiration: number) => {
        const scope = this.astrometry.currentStatus.selectedScope;
        const slewRate = this.astrometry.currentStatus.settings.fineSlew.slewRate;
        if (!scope) {
            throw new Error("No scope selected");
        }

        if (this.expiration >= newExpiration) {
            return;
        }

        this.expiration = newExpiration;

        if (newExpiration < Date.now()) {
            return;
        }

        if (this.task === undefined) {
            this.task = createTask<void>(undefined, async (task)=> {
                try {
                    if (!scope) {
                        throw new Error("No scope selected");
                    }
                    logger.info('Setting TELESCOPE_SLEW_RATE');
                    // FIXME: to much slew rate...
                    await this.astrometry.indiManager.setParam(task.cancellation, scope, 'TELESCOPE_SLEW_RATE', {
                        [slewRate]: 'On'
                    });
                    // await this.astrometry.setSlewRate(scope, slewRate);
                    this.lastStart = Date.now();
                    await this.astrometry.indiManager.pulseParam(task.cancellation, scope, this.indiVector, this.indiProperty);

                } finally {
                    if (this.task === task) {
                        this.task = undefined;
                        this.flushElapsed();
                        this.lastStart = undefined;
                    }
                }
            });
        }
        this.updateTimeout();
    }

    getTotalDurationAndResetStat = ()=> {
        this.flushElapsed();
        const ret = this.elapsed;
        this.elapsed = 0;
        return ret;
    }

    cancelTimeout = ()=> {
        if (this.watchTimeout) {
            clearTimeout(this.watchTimeout);
            this.watchTimeout = undefined;
        }
    }

    updateTimeout = ()=> {
        this.cancelTimeout();
        const duration = Math.max(0, this.expiration - Date.now());
        this.watchTimeout = setTimeout(()=> {
            this.interrupt();
        }, duration);
    }

    interrupt = async () => {
        this.expiration = 0;
        if (this.task) {
            const t = this.task;
            this.taskInterrupted = true;
            t.cancel();
            try {
                await t;
            } catch(e) {
            }
        }
    }
};

// Astrometry requires: a camera, a mount
export default class Astrometry implements RequestHandler.APIAppProvider<BackOfficeAPI.AstrometryAPI>{
    appStateManager: JsonProxy<BackofficeStatus>;
    readonly context: AppContext;
    currentStatus: AstrometryStatus;
    currentProcess: Task<any>|null = null;
    get imageProcessor() { return this.context.imageProcessor };
    get indiManager() { return this.context.indiManager };
    get camera() { return this.context.camera };

    runningWizard: null|Wizard = null;

    constructor(app:ExpressApplication, appStateManager:JsonProxy<BackofficeStatus>, context: AppContext) {
        this.appStateManager = appStateManager;

        const initialStatus: AstrometryStatus = {
            status: "empty",
            lastOperationError: null,
            scopeStatus: "idle",
            scopeReady: true,
            scopeMovedSinceImage: false,
            scopeDetails: "not initialised",
            image: null,
            imageUuid: null,
            result: null,
            selectedScope: null,
            target: null,
            settings: defaultSettings(),
            narrowedField: null,
            useNarrowedSearchRadius: false,
            runningWizard: null,
            currentImagingSetup: null,
            fineSlew: {
                slewing: false,
                learning: null,
                learned: null
            }
        };

        this.appStateManager.getTarget().astrometry = initialStatus;
        this.currentStatus = this.appStateManager.getTarget().astrometry;
        this.context = context;

        new ConfigStore<AstrometrySettings>(appStateManager, 'astrometry', ['astrometry', 'settings'],
            defaultSettings(),
            defaultSettings(),
            (c)=>{
                // FIXME: really usefull ???
                if (!c.polarAlign) {
                    c.polarAlign = defaultSettings().polarAlign;
                }
                if (!c.polarAlign.az) {
                    c.polarAlign.az = defaultSettings().polarAlign.az;
                }
                if (!c.polarAlign.alt) {
                    c.polarAlign.alt = defaultSettings().polarAlign.alt;
                }

                // Adjust here if required
                return c;
            }
        );

        // listener to adjust scopeStatus (only when ok/ko)
        this.appStateManager.addSynchronizer([
            [
                [   'indiManager', 'deviceTree', null, 'CONNECTION', 'childs', 'CONNECT' ],
                [   'astrometry', 'selectedScope' ]
            ]
        ],
            this.syncScopeStatus, true
        );

        context.indiManager.createPreferredDeviceSelector<AstrometryStatus>({
            availablePreferedCurrentPath: [
                [
                    [ 'indiManager' , 'availableScopes'],
                    [ 'astrometry' , 'settings', 'preferedScope'],
                    [ 'astrometry' , 'selectedScope'],
                ]
            ],
            read: ()=> ({
                available: this.indiManager.currentStatus.availableScopes,
                prefered: this.currentStatus.settings.preferedScope,
                current: this.currentStatus.selectedScope,
            }),
            set: (s:{prefered?: string|null|undefined, current?: string|null|undefined})=>{
                if (s.prefered !== undefined) {
                    this.currentStatus.settings.preferedScope = s.prefered;
                }
                if (s.current !== undefined) {
                    this.currentStatus.selectedScope = s.current;
                }
            }
        });

        context.imagingSetupManager.createPreferredImagingSelector({
            currentPath: [ 'astrometry', 'currentImagingSetup' ],
            preferedPath: [ 'astrometry', 'settings', 'preferedImagingSetup' ],
            read: ()=> ({
                prefered: this.currentStatus.settings.preferedImagingSetup,
                current: this.currentStatus.currentImagingSetup,
            }),
            set: (s:{prefered?: string|null|undefined, current?: string|null|undefined})=>{
                if (s.prefered !== undefined) {
                    this.currentStatus.settings.preferedImagingSetup = s.prefered;
                }
                if (s.current !== undefined) {
                    this.currentStatus.currentImagingSetup = s.current;
                }
            }
        });
    }

    private readonly syncScopeStatus=()=>
    {
        try {
            if (this.currentStatus.selectedScope === null) {
                throw new Error("no scope selected");
            }

            const connection = this.context.indiManager.getValidConnection();

            const device = connection.getDevice(this.currentStatus.selectedScope);

            if (device.getVector('CONNECTION').getPropertyValueIfExists('CONNECT') !== 'On') {
                throw new Error("scope not connected");
            }

            this.currentStatus.scopeReady = true;
            this.currentStatus.scopeDetails = null;
        } catch(e) {
            this.currentStatus.scopeReady = false;
            this.currentStatus.scopeDetails = (e as any).message || (""+e);
        }
    }

    private ongoingSlewRateChange : boolean = false;

    public setSlewRate = async(ct: CancellationToken, scope: string, slewRate: string) => {
        if (!this.indiManager.getSwitchPropertyValue(scope, 'TELESCOPE_SLEW_RATE', slewRate)) {
            if (this.ongoingSlewRateChange) {
                // Conflict ? Await ?
            }
            logger.info('Setting slew rate', {scope, slewRate});
            this.ongoingSlewRateChange = true;
            try {
                // FIXME: to much slew rate...
                await this.indiManager.setParam(ct, scope, 'TELESCOPE_SLEW_RATE', {
                    [slewRate]: 'On'
                });
            } finally {
                this.ongoingSlewRateChange = false;
            }
        }

    }

    private moveAxis(start: {x: number; y: number}, imageSize: {width: number, height: number}, step: number) : [number, number]
    {
        let st : [number, number] = [start.x, start.y];
        let sze = [imageSize.width, imageSize.height];

        let current = st[step];
        let max = sze[step];
        const delta = max * 0.4;
        if (current > max / 2) {
            current -= delta;
        } else {
            current += delta;
        }

        st[step] = current;

        return st;
    }

    public readonly fineSlewStartLearning = async (ct : CancellationToken, payload: BackOfficeAPI.FineSlewLearnRequest)=> {
        if (this.currentStatus.currentImagingSetup !== payload.imagingSetup) {
            throw new Error("Please use same imaging setup than astrometry");
        }
        if (payload.x === undefined || payload.y === undefined || payload.width === undefined || payload.height === undefined) {
            throw new Error("Starting point is not set");
        }
        const learning:FineSlewLearning = {
            acquiredCount: 0,
            imagingSetup: payload.imagingSetup,
            start: [ payload.x, payload.y ],
            end: this.moveAxis(payload, payload, 0),
            frameSize: {width: payload.width, height: payload.height},
            vectors: [],
        }
        this.currentStatus.fineSlew.learning = learning;
        logger.info("Slew calibration starting", learning);

        this.slewStatus.north.getTotalDurationAndResetStat();
        this.slewStatus.south.getTotalDurationAndResetStat();
        this.slewStatus.east.getTotalDurationAndResetStat();
        this.slewStatus.west.getTotalDurationAndResetStat();

        this.currentStatus.fineSlew.learned = null;
    };

    public readonly fineSlewContinueLearning = async(ct: CancellationToken, payload: BackOfficeAPI.FineSlewLearnContinueRequest) => {
        if (!this.currentStatus.fineSlew.learning) {
            throw new Error("No learning in progress");
        }
        if (this.currentStatus.currentImagingSetup !== payload.imagingSetup) {
            throw new Error("Please use same imaging setup than astrometry");
        }

        const learning = this.currentStatus.fineSlew.learning;

        const vector = [ learning.end[0] - learning.start[0] , learning.end[1] - learning.start[1] ];
        const vectorId = learning.acquiredCount;

        let northDuration = this.slewStatus.north.getTotalDurationAndResetStat()
                            - this.slewStatus.south.getTotalDurationAndResetStat();
        northDuration /= vector[vectorId];
        let westDuration = this.slewStatus.west.getTotalDurationAndResetStat()
                            - this.slewStatus.east.getTotalDurationAndResetStat();
        westDuration /= vector[vectorId];

        logger.info("Slew calibration progress", {
            vectorId,
            northDuration,
            westDuration
        });

        learning.vectors.push({northDuration, westDuration});

        this.currentStatus.fineSlew.learning.acquiredCount++;

        if (learning.acquiredCount < 2) {
            learning.start = [...learning.end];
            learning.end = this.moveAxis({x: learning.start[0], y: learning.start[1]}, learning.frameSize, 1);
        } else {
            this.currentStatus.fineSlew.learned = {
                imagingSetup: learning.imagingSetup,
                vectors: learning.vectors,
                frameSize: learning.frameSize,
            }
            this.currentStatus.fineSlew.learning = null;
        }
    }

    public readonly fineSlewAbortLearning = async (ct : CancellationToken)=> {
        this.currentStatus.fineSlew.learning = null;
    };

    private readonly twoAxisSlew = async(ct: CancellationToken, amount: SlewCalibrationVector) => {
        // Check all axis are idle
        await Promise.all(
            [
                this.slewStatus.east.interrupt(),
                this.slewStatus.west.interrupt(),
                this.slewStatus.north.interrupt(),
                this.slewStatus.south.interrupt(),
            ]);

        const axisNS = amount.northDuration > 0 ? this.slewStatus.north : this.slewStatus.south;
        const axisNSDuration = Math.abs(amount.northDuration);

        const axisWE = amount.westDuration > 0 ? this.slewStatus.west : this.slewStatus.east;
        const axisWEDuration = Math.abs(amount.westDuration);

        const result = await Promise.allSettled(
            [
                axisNS.directSlew(ct, axisNSDuration),
                axisWE.directSlew(ct, axisWEDuration),
            ]);
        for(const r of result) {
            if (r.status === 'rejected') {
                throw r.reason;
            }
        }
    }

    currentSlewTask?: Task<void> = undefined;

    public readonly fineSlewSendTo = async(ct: CancellationToken, payload: BackOfficeAPI.FineSlewSendToRequest) => {
        await createTask<void>(ct, async(t: Task<void>)=> {
            if (this.currentSlewTask !== undefined) {
                throw new Error("Slew already running");
            }
            const learned = this.currentStatus.fineSlew.learned;
            if (learned === null) {
                throw new Error("Fine slew was not learned");
            }
            if (learned.imagingSetup !== payload.imagingSetup) {
                throw new Error("Please use same imaging setup than astrometry");
            }
            if (this.currentStatus.currentImagingSetup !== payload.imagingSetup) {
                throw new Error("Please use same imaging setup than astrometry");
            }

            this.currentSlewTask = t;
            try {
                this.currentStatus.fineSlew.slewing = true;
                const delta = {
                    x: payload.targetX - payload.x,
                    y: payload.targetY - payload.y,
                }

                const slew: SlewCalibrationVector = {
                    northDuration: delta.x * learned.vectors[0].northDuration
                                 + delta.y * learned.vectors[1].northDuration,
                    westDuration:  delta.x * learned.vectors[0].westDuration
                                 + delta.y * learned.vectors[1].westDuration,
                }

                await(this.twoAxisSlew(t.cancellation, slew));
            } finally {
                this.currentSlewTask = undefined;
                this.currentStatus.fineSlew.slewing = false;
            }
        });
    };

    public readonly abortSlew = async(ct: CancellationToken) => {
        const currentSlew = this.currentSlewTask;
        if (currentSlew) {
            currentSlew.cancel();
        } else {
            await Promise.all(
                [
                    this.slewStatus.east.interrupt(),
                    this.slewStatus.west.interrupt(),
                    this.slewStatus.north.interrupt(),
                    this.slewStatus.south.interrupt(),
                ]);
        }
    }

    private slewStatus = {
        north: new SlewAxisStatus(this, "north", "TELESCOPE_MOTION_NS", "MOTION_NORTH"),
        south: new SlewAxisStatus(this, "south", "TELESCOPE_MOTION_NS", "MOTION_SOUTH"),
        west: new SlewAxisStatus(this, "west", "TELESCOPE_MOTION_WE", "MOTION_WEST"),
        east: new SlewAxisStatus(this, "east", "TELESCOPE_MOTION_WE", "MOTION_EAST"),
    };

    private oppositeDirections: {[id: string]: BackOfficeAPI.SlewDirection} = {
        north : "south",
        south : "north",
        west  : "east",
        east  : "west",
    };

    public readonly slew = async (ct: CancellationToken, payload: BackOfficeAPI.SlewSwitchRequest)=> {
        const direction = payload.direction;
        const opposite:BackOfficeAPI.SlewDirection = this.oppositeDirections[direction];

        if (!payload.release) {
            const newExpiration = Date.now() + 1000;

            // FIXME: handle the unlikely events that current scope change (stop motions)
            while (this.slewStatus[opposite].task !== undefined) {
                try {
                    ct.throwIfCancelled();
                    if (this.currentSlewTask !== undefined) {
                        throw new Error("Slew busy");
                    }

                    await this.slewStatus[opposite].task;
                } catch(e) {}
            }
            ct.throwIfCancelled();
            if (this.currentSlewTask !== undefined) {
                throw new Error("Slew busy");
            }

            this.slewStatus[direction].awake(newExpiration);
        } else {
            if (this.currentSlewTask !== undefined) {
                throw new Error("Slew busy");
            }

            await this.slewStatus[direction].interrupt();
        }
    }

    getAPI(): RequestHandler.APIAppImplementor<BackOfficeAPI.AstrometryAPI> {
        return {
            updateCurrentSettings: this.updateCurrentSettings,
            setCurrentImagingSetup: this.setCurrentImagingSetup,
            compute: this.wizardProtectedApi(this.compute),
            cancel: this.wizardProtectedApi(this.cancel),
            setScope: this.setScope,
            goto: this.wizardProtectedApi(this.goto),
            sync: this.wizardProtectedApi(this.sync),
            startPolarAlignmentWizard: this.startPolarAlignmentWizard,
            startMeridianFlipWizard: this.startMeridianFlipWizard,
            wizardNext: this.wizardNext,
            wizardInterrupt: this.wizardInterrupt,
            wizardQuit: this.wizardQuit,
            fineSlewStartLearning: this.fineSlewStartLearning,
            fineSlewContinueLearning: this.fineSlewContinueLearning,
            fineSlewAbortLearning: this.fineSlewAbortLearning,
            fineSlewSendTo: this.fineSlewSendTo,
            slew: this.slew,
            abortSlew: this.abortSlew,
        }
    }

    setCurrentImagingSetup=async (ct: CancellationToken, message:{imagingSetup:null|string})=>{
        if (message.imagingSetup !== null && !this.context.imagingSetupManager.getImagingSetupInstance(message.imagingSetup).exists()) {
            throw new Error("invalid imaging setup");
        }
        this.currentStatus.currentImagingSetup = message.imagingSetup;
    }

    updateCurrentSettings = async (ct: CancellationToken, payload: {diff: any}) => {
        const newSettings = JsonProxy.applyDiff(this.currentStatus.settings, payload.diff);
        // FIXME: do the checking !
        this.currentStatus.settings = newSettings;
    }

    wizardProtectedApi = <A, B>(process: (ct: CancellationToken, message:A)=>Promise<B>)=>{
        return async (ct: CancellationToken, message: A) => {
            if (this.currentStatus.runningWizard !== null
                && !this.currentStatus.runningWizard.paused) {
                throw new Error(this.currentStatus.runningWizard.id + " in progress - can't continue");
            }

            return await process(ct, message);
        }
    }

    baseRequest = (forceWide:boolean)=> {
        let result : Omit<ProcessorAstrometryRequest, 'source'> = {
            "exePath": "",
            "libraryPath": "",
            "fieldMin":
                this.currentStatus.narrowedField !== null && !forceWide
                    ? this.currentStatus.narrowedField * 100 / (100 + this.currentStatus.settings.narrowedFieldPercent)
                    : this.currentStatus.settings.initialFieldMin,
            "fieldMax":
                this.currentStatus.narrowedField !== null && !forceWide
                    ? this.currentStatus.narrowedField * (100 + this.currentStatus.settings.narrowedFieldPercent) / 100
                    : this.currentStatus.settings.initialFieldMax,
            "raCenterEstimate": 0,
            "decCenterEstimate": 0,
            "searchRadius": 180,
            "numberOfBinInUniformize": 10,
        };
        return result;
    }

    captureScopePos = async(ct: CancellationToken, targetScope: string) => {
        this.context.indiManager.checkDeviceConnected(targetScope);
        const mountDevice = this.context.indiManager.getValidConnection().getDevice(targetScope);

        const vector = mountDevice.getVector('EQUATORIAL_EOD_COORD');
        if (!vector.isReadyForOrder()) {
            throw new Error("Mount is busy");
        }

        const scopeRa = parseFloat(vector.getPropertyValue("RA"));
        const scopeDec = parseFloat(vector.getPropertyValue("DEC"));
        if (isNaN(scopeRa)||isNaN(scopeDec)) {
            throw new Error("Invalid mount position");
        }

        const j2000Center = SkyProjection.J2000RaDecFromEpoch([scopeRa*360/24, scopeDec], Date.now());
        let result = {
            raCenterEstimate : j2000Center[0],
            decCenterEstimate : j2000Center[1],
        }
        return result;
    }

    captureSearchRadius = async(ct: CancellationToken, targetScope: string, forceWide: boolean) => {
        const radius = this.currentStatus.useNarrowedSearchRadius && !forceWide
            ? this.currentStatus.settings.narrowedSearchRadius
            : this.currentStatus.settings.initialSearchRadius;

        return {
            searchRadius: radius !== null ? radius : 180
        }
    }

    captureScopeParameters = async(ct: CancellationToken, forceWide: boolean, constraints? : Partial<ProcessorAstrometryConstraints>):Promise<Partial<ProcessorAstrometryConstraints>> => {
        let wantPos = constraints?.raCenterEstimate === undefined || constraints?.decCenterEstimate === undefined;
        let wantRadius = constraints?.searchRadius === undefined;

        if (!wantPos && !wantRadius) {
            return constraints || {};
        }

        if (this.currentStatus.settings.useMountPosition) {
            // Use scope position, with either small or large radius
            try {
                const targetScope = this.currentStatus.selectedScope;
                if (!targetScope) {
                    throw new Error('No mount selected');
                }

                return {
                    ... wantPos ? (await this.captureScopePos(ct, targetScope)) : {},
                    ... wantRadius ? (await this.captureSearchRadius(ct, targetScope, forceWide)) : {},
                    ...constraints
                }
            } catch(e) {
                logger.warn('Astrometry problem with mount - doing wide scan', e);
            }
        }
        return {};
    }

    compute = async(ct: CancellationToken, message:BackOfficeAPI.AstrometryComputeRequest)=>{
        return await this.internalCompute(ct, message.imageUuid, !!message.forceWide);
    }

    internalCompute = async(ct: CancellationToken, imageUuid:string, forceWide: boolean, constraints? : Partial<ProcessorAstrometryConstraints>)=>{
        const imageStatus: ImageStatus|undefined = this.context.camera.getImageByUuid(imageUuid);
        if (!imageStatus) {
            throw new Error("Image not found");
        }

        return await createTask<AstrometryResult>(ct, async (task) => {
            if (this.currentProcess !== null) {
                throw new Error("Astrometry already in process");
            }

            const finish = (status: AstrometryStatus['status'], error:string|null, result:AstrometryResult|null)=> {
                this.currentProcess = null;
                this.currentStatus.status = status;
                this.currentStatus.lastOperationError = error;
                this.currentStatus.result = result;

                if (this.currentStatus.result !== null && this.currentStatus.result.found) {
                    const skyProjection = SkyProjection.fromAstrometry(this.currentStatus.result);
                    // Compute the narrowed field
                    this.currentStatus.narrowedField = skyProjection.getFieldSize(this.currentStatus.result.width, this.currentStatus.result.height); 
                }

                if (result !== null) {
                    // Report into the image
                    const image = this.context.camera.getImageByUuid(imageUuid);
                    if (image) {
                        image.astrometry = {...result};
                    }
                }
            };

            let result: AstrometryResult;
            this.currentProcess = task;
            try {
                this.currentStatus.imageUuid = imageUuid;
                this.currentStatus.image = imageStatus.path;
                this.currentStatus.scopeMovedSinceImage = false;
                this.currentStatus.status = 'computing';
                this.currentStatus.result = null;
                this.currentStatus.target = null;
                this.currentStatus.lastOperationError = null;

                const astrometry:ProcessorAstrometryRequest = {
                    ...this.baseRequest(!!forceWide),
                    "source": {
                        "source": {
                            "path": imageStatus.path,
                            streamId: "",
                        }
                    },
                    ...(await this.captureScopeParameters(ct, forceWide, constraints)),
                }

                logger.info('Starting astrometry', {astrometry});
                result = await this.imageProcessor.compute(task.cancellation, {astrometry});
            } catch(e) {
                if (e instanceof CancellationToken.CancellationError) {
                    finish('empty', null, null);
                } else {
                    finish('error', (e as any).message || '' + e, null);
                }
                throw e;
            }
            finish('ready', null, result);
            return result;
        });
    }

    cancel = async (ct: CancellationToken, message: {})=>{
        if (this.currentProcess !== null) {
            this.currentProcess.cancel("user cancel");
        }
    }

    setScope = async (ct: CancellationToken, message: {deviceId: string})=>{
        if (this.indiManager.currentStatus.availableScopes.indexOf(message.deviceId) === -1) {
            throw new Error("device not available");
        }
        this.currentStatus.selectedScope = message.deviceId;
    }

    doGoto = async(ct: CancellationToken, targetScope: string, target: {ra: number, dec:number}) => {
        // check no motion is in progress
        await this.context.indiManager.setParam(
                ct,
                targetScope,
                'ON_COORD_SET',
                {'TRACK': 'On'},
                true,
                true);

        await this.context.indiManager.setParam(
                ct,
                targetScope,
                'EQUATORIAL_EOD_COORD',
                {
                    'RA': ''+ target.ra * 24 / 360,
                    'DEC': '' + target.dec,
                },
                true,
                true,
                // Aborter...
                (connection:IndiConnection, devId:string)=>{
                    logger.info('Cancel requested');
                    const dev = connection.getDevice(devId);
                    const vec = dev.getVector("TELESCOPE_ABORT_MOTION")
                    vec.setValues([{name:"ABORT", value:"On"}]);
                });
    }

    goto = async (ct: CancellationToken, message:BackOfficeAPI.AstrometryGotoScopeRequest)=>{
        return await createTask<void>(ct, async (task) => {
            if (this.currentProcess !== null) {
                throw new Error("Astrometry already in process");
            }
            
            const targetScope = this.currentStatus.selectedScope;
            if (!targetScope) {
                throw new Error("No scope selected for astrometry");
            }
            
            const finish = (status: AstrometryStatus['scopeStatus'], error:string|null)=> {
                this.currentProcess = null;
                this.currentStatus.scopeStatus = status;
                this.currentStatus.lastOperationError = error;
            };

            logger.info('Astrometry: goto', message);
            this.currentProcess = task;
            try {
                this.currentStatus.scopeStatus = 'moving';
                this.currentStatus.scopeMovedSinceImage = true;
                this.currentStatus.lastOperationError = null;
                this.currentStatus.target = {ra:message.ra, dec:message.dec};

                await this.doGoto(task.cancellation, targetScope, message);
            } catch(e) {
                if (e instanceof CancellationToken) {
                    finish('idle', null);
                } else {
                    finish('idle', (e as any).message || ('' + e));
                }
                throw e;
            }
            finish('idle', null);
        });
    }

    clearSync = async(ct: CancellationToken, targetScope: string) => {
        // Check that scope is connected
        this.context.indiManager.checkDeviceConnected(targetScope);

        const target = { vec: 'ALIGNLIST', prop: 'ALIGNLISTCLEAR'};

        const curValue = this.context.indiManager.getValidConnection().getDevice(targetScope).getVector(target.vec).getPropertyValueIfExists(target.prop);

        if (curValue !== null) {
            logger.info(`Clearing alignment the eqmod way for ${targetScope}`);
            await this.context.indiManager.setParam(
                ct,
                targetScope,
                target.vec,
                {[target.prop]: 'On'},
                true,
                true);
        }
    }

    // Target is expected in degree
    doSync = async(ct: CancellationToken, targetScope: string, target: {ra: number, dec:number}) => {

        // Check that scope is connected
        this.context.indiManager.checkDeviceConnected(targetScope);

        // true,true=> check no motion is in progress
        logger.info('Setting ON_COORD_SET', {targetScope});
        await this.context.indiManager.setParam(
                ct,
                targetScope,
                'ON_COORD_SET',
                {'SYNC': 'On'},
                true,
                true);
        logger.info('Setting EQUATORIAL_EOD_COORD', {targetScope, ...target});
        await this.context.indiManager.setParam(
                ct,
                targetScope,
                'EQUATORIAL_EOD_COORD',
                {
                    'RA': ''+ target.ra * 24 / 360,
                    'DEC': '' + target.dec,
                },
                true,
                true);
        this.currentStatus.useNarrowedSearchRadius = true;
    }

    sync = async (ct: CancellationToken, message: BackOfficeAPI.AstrometrySyncScopeRequest)=>{
        return await createTask<void>(ct, async (task) => {
            if (this.currentProcess !== null) {
                throw new Error("Astrometry already in process");
            }

            if (this.currentStatus.result === null) {
                throw new Error("Run astrometry first");
            }

            if (!this.currentStatus.result.found) {
                throw new Error("Astrometry failed, cannot sync");
            }

            const targetScope = this.currentStatus.selectedScope;
            if (!targetScope) {
                throw new Error("No scope selected for astrometry");
            }

            logger.info('Astrometry: sync', message);

            const finish = (status: AstrometryStatus['scopeStatus'], error:string|null)=> {
                this.currentProcess = null;
                this.currentStatus.scopeStatus = status;
                this.currentStatus.lastOperationError = error;
            };

            this.currentProcess = task;
            try {
                this.currentStatus.scopeStatus = 'syncing';
                this.currentStatus.lastOperationError = null;
                this.currentStatus.target = null;

                await this.doSync(task.cancellation, targetScope, message);
            } catch(e) {
                if (e instanceof CancellationToken.CancellationError) {
                    finish('idle', null)
                } else {
                    finish('idle', (e as any).message || ('' + e));
                }
                throw e;
            }
            finish('idle', null);
        });
    }

    setWizard = (id: string, wizardBuilder:()=>Wizard) => {
        if (this.currentProcess !== null) {
            throw new Error("Astrometry is Busy");
        }
        if (this.currentStatus.runningWizard !== null) {
            if (!this.currentStatus.runningWizard.paused) {
                throw new Error(this.currentStatus.runningWizard.id + " already in progress");
            }
            this.runningWizard!.discard();
            this.runningWizard = null;
        }
        this.currentStatus.runningWizard = {
            id,
            title: id,
            paused: false,
            interruptible: false,
            hasNext: null,
        };
        let wizardInstance: Wizard;
        try {
            this.runningWizard = (wizardInstance = wizardBuilder());
        } catch(e) {
            this.currentStatus.runningWizard = null;
            throw e;
        }
        this.runningWizard.start().catch((e)=>{
            if (e instanceof CancellationToken.CancellationError) {
                return;
            }
            throw e;
        }).finally(()=> {
            if (this.runningWizard === wizardInstance) {
                wizardInstance.killed();
            }
        });
    }

    wizardQuit = async (ct:CancellationToken, message: {})=> {
        if (!this.currentStatus.runningWizard) {
            return;
        }

        if (!this.currentStatus.runningWizard.paused) {
            throw new Error("Cannot quit: not paused");
        }
        try {
            this.runningWizard!.discard();
        } catch(e) {
            logger.warn("unable to discard", e);
        }
        this.runningWizard = null;
        this.currentStatus.runningWizard = null;
    }

    wizardInterrupt = async(ct:CancellationToken, message:{})=> {
        if (!this.currentStatus.runningWizard) {
            return;
        }

        if (this.currentStatus.runningWizard.paused) {
            return;
        }
        this.runningWizard!.interrupt();
    }

    wizardNext = async(ct:CancellationToken, message:{})=> {
        if (!this.currentStatus.runningWizard) {
            return;
        }

        if (!this.currentStatus.runningWizard.hasNext) {
            return;
        }
        this.runningWizard!.next();
    }

    startPolarAlignmentWizard = async (ct: CancellationToken, message: {}) => {
        this.setWizard("polarAlignment", ()=>new PolarAlignmentWizard(this));
    }

    startMeridianFlipWizard = async (ct:CancellationToken, message: {}) => {
        this.setWizard("meridianFlip", ()=>new MeridianFlipWizard(this));
    }
}

