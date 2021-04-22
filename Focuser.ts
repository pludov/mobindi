const PolynomialRegression = require('ml-regression-polynomial');
import CancellationToken from 'cancellationtoken';
import Log from './Log';
import { hasKey } from './Obj';
import * as Algebra from './Algebra';
import * as BackOfficeAPI from './shared/BackOfficeAPI';
import * as RequestHandler from './RequestHandler';
import { ExpressApplication, AppContext } from "./ModuleBase";
import ConfigStore from './ConfigStore';
import JsonProxy from './JsonProxy';
import { BackofficeStatus, AutoFocusStatus, FocuserStatus, FocuserUpdateCurrentSettingsRequest, CameraStatus, FocuserSettings, AutoFocusConfiguration } from './shared/BackOfficeStatus';
import { Task, createTask } from './Task';
import Camera from './Camera';
import IndiManager from "./IndiManager";
import {ImagingSetupInstance} from "./ImagingSetupManager";
import ImageProcessor from "./ImageProcessor";

const logger = Log.logger(__filename);

export default class Focuser implements RequestHandler.APIAppImplementor<BackOfficeAPI.FocuserAPI>{
    readonly appStateManager: JsonProxy<BackofficeStatus>;
    readonly currentStatus: FocuserStatus;
    currentPromise: Task<number>|null;
    camera: Camera;
    indiManager: IndiManager;
    imageProcessor: ImageProcessor;
    context: AppContext;
    constructor(app:ExpressApplication, appStateManager:JsonProxy<BackofficeStatus>, context:AppContext)
    {
        this.context = context;
        this.appStateManager = appStateManager;
        this.appStateManager.getTarget().focuser = {
            currentImagingSetup: null,
            config: {
                preferedImagingSetup: null,
            },
            current: {
                status: 'idle',
                error: null,
                imagingSetup: null,
                // position => details
                firstStep: 0,
                lastStep: 10000,
                points: {
                    "5000": {
                        fwhm: 2.9
                    },
                    "6000": {
                        fwhm: 2.7
                    },
                    "7000": {
                        fwhm: 2.5
                    },
                    "8000": {
                        fwhm: 2.6
                    },
                    "9000": {
                        fwhm: 2.8
                    }
                },
                predicted: {
                },
                targetStep: 3000
            }
        };
        this.currentStatus = this.appStateManager.getTarget().focuser;
        new ConfigStore<AutoFocusConfiguration>(appStateManager, 'focuser', ['focuser', 'config'], {
                preferedImagingSetup: null,
            }, {
                preferedImagingSetup: null,
            });
        this.currentPromise = null;
        this.resetCurrent('idle');
        this.camera = context.camera;
        this.indiManager = context.indiManager;
        this.imageProcessor = context.imageProcessor;

        context.imagingSetupManager.createPreferredImagingSelector({
            currentPath: [ 'focuser', 'currentImagingSetup' ],
            preferedPath: [ 'focuser', 'config', 'preferedImagingSetup' ],
            read: ()=> ({
                prefered: this.currentStatus.config.preferedImagingSetup,
                current: this.currentStatus.currentImagingSetup,
            }),
            set: (s:{prefered?: string|null|undefined, current?: string|null|undefined})=>{
                if (s.prefered !== undefined) {
                    this.currentStatus.config.preferedImagingSetup = s.prefered;
                }
                if (s.current !== undefined) {
                    this.currentStatus.currentImagingSetup = s.current;
                }
            }
        });
    }

    getAPI():RequestHandler.APIAppImplementor<BackOfficeAPI.FocuserAPI> {
        return {
            abort: this.abort,
            focus: this.focus,
            updateCurrentSettings: this.updateCurrentSettings,
            setCurrentImagingSetup: this.setCurrentImagingSetup,
        }
    }

    resetCurrent(status: AutoFocusStatus['status'])
    {
        this.currentStatus.current = {
            status: status,
            imagingSetup: null,
            error: null,
            firstStep: null,
            lastStep: null,
            targetStep: null,
            points: {},
            predicted: {}
        }
    }

    setCurrentStatus(status: AutoFocusStatus['status'], error: any)
    {
        this.currentStatus.current.status = status;
        if (error) {
            this.currentStatus.current.error = '' + (error.message || error);
        }
    }

    private rawMoveFocuser = async(ct: CancellationToken, focuserId: string, position: number)=>{
        await this.indiManager.setParam(ct, focuserId, 'ABS_FOCUS_POSITION', {
                FOCUS_ABSOLUTE_POSITION: '' + position
            },
            false,
            true,
            (connection, devId, vectorId) => {
                const vec = connection.getDevice(devId).getVector('FOCUS_ABORT_MOTION');
                vec.setValues([{name: 'ABORT', value: 'On'}]);
            }
        );
    }

    private getCurrentConfiguration(): {imagingSetupInstance: ImagingSetupInstance, camera: string, focuser: string, settings: FocuserSettings} {
        const imagingSetupInstance = this.context.imagingSetupManager.getImagingSetupInstance(this.currentStatus.currentImagingSetup);

        if (!imagingSetupInstance.exists()) {
            throw new Error("No imaging setup selected");
        }

        const camera = imagingSetupInstance.config().cameraDevice;
        if (camera === null) {
            throw new Error("No camera selected");
        }
        if (!hasKey(this.camera.currentStatus.dynStateByDevices, camera)) {
            throw new Error("Invalid camera");
        }

        const focuser = imagingSetupInstance.config().focuserDevice;
        if (focuser === undefined || focuser === null) {
            throw new Error("No focuser selected");
        }

        const settings = imagingSetupInstance.config().focuserSettings;
        return {
            imagingSetupInstance: imagingSetupInstance, camera, focuser, settings
        }
    }

    // Adjust the focus
    private async doFocus(ct: CancellationToken):Promise<number> {
        const config = this.getCurrentConfiguration();
        const imagingSetup:string = config.imagingSetupInstance.uid!;

        this.currentStatus.current.imagingSetup = imagingSetup;

        const amplitude = config.settings.range;
        const stepCount = config.settings.steps;
        const data:Array<number[]> = [];
        logger.info("Starting focus", {config});

        // Find focuser & camera.
        const connection = this.indiManager.getValidConnection();
        const focuserId = config.focuser;
        
        // check device connected
        const focuser = connection.getDevice(focuserId);
        if (!focuser.isConnected()) {
            logger.warn("Focuser not connected");
            throw new Error("Focuser not connected");
        }
        if (!connection.getDevice(config.camera).isConnected()) {
            logger.warn("Camera not connected");
            throw new Error("Camera not connected");
        }
        // Move to the starting point
        const absPos = focuser.getVector('ABS_FOCUS_POSITION');
        if (!absPos.isReadyForOrder()) {
            logger.warn("Focuser not ready");
            throw new Error("Focuser is not ready");
        }

        let initialPos:number = parseFloat(absPos.getPropertyValue("FOCUS_ABSOLUTE_POSITION"));
        let lastKnownPos:number = initialPos;
        const start = config.settings.targetCurrentPos
                ? lastKnownPos
                : config.settings.targetPos;

        logger.info('start pos', {start});
        let firstStep = Math.round(start - amplitude);
        let lastStep = Math.round(start + amplitude);
        let stepSize = Math.ceil(2 * amplitude / stepCount);
        if (stepSize < 1) {
            stepSize = 1;
        }

        if (firstStep < 0) {
            firstStep = 0;
        }
        if (Math.abs(lastStep - firstStep) / stepSize < 5) {
            logger.warn("Not enough step");
            throw new Error("Not enough step - at least 5 required");
        }

        // FIXME: check lastStep < focuser max

        const moveForward = config.settings.lowestFirst;
        // Negative focus swap steps
        if (!moveForward) {
            const tmp = lastStep;
            lastStep = firstStep;
            firstStep = tmp;
        }

        this.currentStatus.current.firstStep = firstStep;
        this.currentStatus.current.lastStep = lastStep;

        let currentStep = firstStep;
        let stepId = 0;
        
        const moveFocuser= async(target:number)=>{
            target = Math.round(target);

            const backlash = config.settings.backlash;
            let intermediate = undefined;
            if (backlash != 0) {
                if (moveForward) {
                    // Need backlash clearance in this direction
                    if (target < lastKnownPos) {
                        intermediate = target - backlash;
                    }
                } else {
                    if (target > lastKnownPos) {
                        intermediate = target + backlash;
                    }
                }
                if (intermediate !== undefined && intermediate < 0) {
                    intermediate = 0;
                }
                // FIXME: check upper bound
            }

            lastKnownPos = target;
            
            if ((intermediate !== undefined) && (intermediate !== target)) {
                // Account for backlash
                logger.info('Clearing backlash', {intermediate, target});
                await this.rawMoveFocuser(ct, focuserId, intermediate);
            }

            // Direct move
            logger.info('Moving focuser', {target});
            await this.rawMoveFocuser(ct, focuserId, target);
        }

        function nextStep() {
            return currentStep + (moveForward ? stepSize : -stepSize);
        }

        function done(step:number) {
            return moveForward ? step > lastStep : step < lastStep
        }

        // Move to currentStep
        await moveFocuser(currentStep);
        
        while(!done(currentStep)) {
            
            logger.info('shoot start');
            const shootResult = await this.camera.doShoot(ct, imagingSetup,
                        (settings)=>({
                            ...settings,
                            prefix: 'focus_ISO8601_step_' + Math.floor(currentStep)
                        }));
        
            const moveFocuserPromise = done(nextStep()) ? undefined : moveFocuser(nextStep());
            try {
                const starFieldResponse = await this.imageProcessor.compute(ct, {
                    starField: { source: {
                        path: shootResult.path,
                        streamId: "",
                    }}
                });
                
                const starField = starFieldResponse.stars;
                logger.info('got starfield', {starCount: starField.length});
                let fwhm:number|null = Algebra.starFieldFwhm(starField);
                logger.info('fwhm result', {currentStep, fwhm});
                if (isNaN(fwhm!)) {
                    fwhm = null;
                }

                if (fwhm !== null) {
                    data.push( [currentStep, fwhm ]);
                }

                this.currentStatus.current.points[currentStep] = {
                    fwhm: fwhm
                };

                currentStep = nextStep();
                logger.debug('next step', {currentStep});
                stepId++;
            } finally {
                await moveFocuserPromise;
            }
        }

        if (data.length < 5) {
            logger.warn('Could not find best position. Moving back to origin', {initialPos});
            await moveFocuser(initialPos);
            throw new Error("Not enough data for focus");
        }
        
        logger.info('regression', {data});
        const result = new PolynomialRegression(data.map(e=>e[0]), data.map(e=>e[1]), 4);
        // This is ugly. but works
        const precision = Math.min(Math.abs(lastStep - firstStep), 128);
        let bestValue = undefined;
        let bestPos: number|undefined;
        for(let i = 0; i <= precision; ++i) {
            const pos = firstStep + (i === 0 ? 0 : i * (lastStep - firstStep) / precision);
            const pred = result.predict(pos);
            logger.debug('predict at : '  + i + '#' +pos+' => ' + JSON.stringify(pred));
            const valueAtPos = pred;
            this.currentStatus.current.predicted[pos] = {
                fwhm: valueAtPos
            };
            if (i === 0 || bestValue > valueAtPos) {
                bestValue = valueAtPos;
                bestPos = pos;
            }
        }
        logger.info('Found best position', {bestPos, bestValue});
        await moveFocuser(bestPos!);
        return bestPos!;
    }

    // FIXME: drop - prefere ImagingSetup.updateCurrentSettings
    setCurrentImagingSetup=async(ct:CancellationToken, message: {imagingSetup: string|null})=> {
        if (message.imagingSetup !== null && !this.context.imagingSetupManager.getImagingSetupInstance(message.imagingSetup).exists()) {
            throw new Error("invalid imaging setup");
        }
        this.currentStatus.currentImagingSetup = message.imagingSetup;
    }

    updateCurrentSettings=async(ct:CancellationToken, message:FocuserUpdateCurrentSettingsRequest)=>
    {
        const config = this.getCurrentConfiguration();
        const newSettings = JsonProxy.applyDiff(config.settings, message.diff);
        // FIXME: do the checking !
        config.imagingSetupInstance.config().focuserSettings = newSettings;
    }

    focus=async(ct:CancellationToken, message:{}):Promise<number>=>{
        return await createTask<number>(ct, async (task)=>{
            if (this.currentPromise !== null) {
                throw new Error("Focus already started");
            }
            this.currentPromise = task;

            try {
                this.resetCurrent('running');
                const ret:number = await this.doFocus(task.cancellation);
                this.setCurrentStatus('done', null);
                return ret;
            } catch(e) {
                if (e instanceof CancellationToken.CancellationError) {
                    this.setCurrentStatus('interrupted', e);
                } else {
                    this.setCurrentStatus('error', e);
                }
                throw e;
            } finally {
                this.currentPromise = null;
            }
        });
    }

    abort=async(ct:CancellationToken, message: {})=>{
        if (this.currentPromise !== null) {
            this.currentPromise.cancel();
        }
    }
}
