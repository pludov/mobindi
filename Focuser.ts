const PolynomialRegression = require('ml-regression-polynomial');
import CancellationToken from 'cancellationtoken';
import { hasKey } from './Obj';
import * as BackOfficeAPI from './shared/BackOfficeAPI';
import * as RequestHandler from './RequestHandler';
import { ExpressApplication, AppContext } from "./ModuleBase";
import ConfigStore from './ConfigStore';
import JsonProxy from './JsonProxy';
import { BackofficeStatus, AutoFocusStatus, FocuserStatus, FocuserUpdateCurrentSettingsRequest, CameraStatus, FocuserSettings, AutoFocusConfiguration } from './shared/BackOfficeStatus';
import { Task, createTask } from './Task';
import Camera from './Camera';
import IndiManager from "./IndiManager";
import ImageProcessor from "./ImageProcessor";
import { DriverInterface } from './Indi';

export default class Focuser implements RequestHandler.APIAppImplementor<BackOfficeAPI.FocuserAPI>{
    readonly appStateManager: JsonProxy<BackofficeStatus>;
    readonly currentStatus: FocuserStatus;
    currentPromise: Task<number>|null;
    camera: Camera;
    indiManager: IndiManager;
    imageProcessor: ImageProcessor;
    constructor(app:ExpressApplication, appStateManager:JsonProxy<BackofficeStatus>, context:AppContext)
    {
        this.appStateManager = appStateManager;
        this.appStateManager.getTarget().focuser = {
            selectedCamera: null,
            availableFocusers: [],
            config: {
                preferedCamera: null,
                settings: {},
            },
            current: {
                status: 'idle',
                error: null,
                camera: null,
                focuser: null,
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
                preferedCamera: null,
                settings: {}
            }, {
                preferedCamera: null,
                settings: {}
            });
        this.currentPromise = null;
        this.resetCurrent('idle');
        this.camera = context.camera;
        this.indiManager = context.indiManager;
        this.imageProcessor = context.imageProcessor;

        // Check that current focuser is valid for all camera
        // FIXME: we could also check for absolute prop
        this.indiManager.createDeviceListSynchronizer((devs:string[])=> {
            this.currentStatus.availableFocusers = devs;
        }, undefined, DriverInterface.FOCUSER);

        // Ensure each focuser has its own configuration
        this.appStateManager.addSynchronizer(
            [ 'focuser', 'availableFocusers' ],
            ()=> {
                const settingRoot = this.currentStatus.config.settings;
                for(const o of this.currentStatus.availableFocusers) {
                    if (!hasKey(settingRoot, o)) {
                        settingRoot[o] = {
                            range: 1000,
                            steps: 5,
                            backlash: 200,
                            lowestFirst: false,
                            targetCurrentPos: true,
                            targetPos: 10000
                        }
                    }
                }
            },
            true,
        );

        // synchronize current camera
        context.indiManager.createPreferredDeviceSelector<CameraStatus>({
            availablePreferedCurrentPath: [
                [
                    [ 'camera' , 'availableDevices'],
                    [ 'focuser' , 'config', 'preferedDevice'],
                    [ 'focuser' , 'selectedCamera'],
                ]
            ],
            read: ()=> ({
                available: this.camera.currentStatus.availableDevices,
                prefered: this.currentStatus.config.preferedCamera,
                current: this.currentStatus.selectedCamera,
            }),
            set: (s:{prefered?: string|null|undefined, current?: string|null|undefined})=>{
                if (s.prefered !== undefined) {
                    this.currentStatus.config.preferedCamera = s.prefered;
                }
                if (s.current !== undefined) {
                    this.currentStatus.selectedCamera = s.current;
                }
            }
        });


        // Ensure each camera has its own focuser
        this.indiManager.createMultiPreferredDeviceSelector({
            availablePreferedCurrentPath:
                [
                    [
                        ['focuser', 'availableFocusers'],
                        ['camera', 'configuration', 'deviceSettings', null, 'preferedFocuserDevice'],
                        ['camera', 'dynStateByDevices', null, 'focuserDevice']
                    ]
                 ]
            ,
            list:()=>Object.keys(this.camera.currentStatus.dynStateByDevices),
            read:(camId:string)=>{
                const camStatus = this.camera.currentStatus;
                if (!hasKey(camStatus.dynStateByDevices, camId)) {
                    return null;
                }
                if (!hasKey(camStatus.configuration.deviceSettings, camId)) {
                    return null;
                }
                return {
                    available: this.currentStatus.availableFocusers,
                    current: camStatus.dynStateByDevices[camId].focuserDevice || null,
                    prefered: camStatus.configuration.deviceSettings[camId].preferedFocuserDevice || null,
                }
            },
            set:(camId: string, values) => {
                const camStatus = this.camera.currentStatus;
                if (values.current !== undefined) {
                    camStatus.dynStateByDevices[camId].focuserDevice = values.current;
                }
                if (values.prefered !== undefined) {
                    camStatus.configuration.deviceSettings[camId].preferedFocuserDevice = values.prefered;
                }
            }
        });
    }

    getAPI():RequestHandler.APIAppImplementor<BackOfficeAPI.FocuserAPI> {
        return {
            abort: this.abort,
            focus: this.focus,
            updateCurrentSettings: this.updateCurrentSettings,
            setCurrentCamera: this.setCurrentCamera,
            setCurrentFocuser: this.setCurrentFocuser,
        }
    }

    resetCurrent(status: AutoFocusStatus['status'])
    {
        this.currentStatus.current = {
            status: status,
            camera: null,
            focuser: null,
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


    private getCurrentConfiguration(): {camera: string, focuser:string, settings: FocuserSettings} {
        const camera = this.currentStatus.selectedCamera;
        if (camera === null) {
            throw new Error("No camera selected");
        }
        
        if (!hasKey(this.camera.currentStatus.dynStateByDevices, camera)) {
            throw new Error("Invalid camera");
        }
        const focuser = this.camera.currentStatus.dynStateByDevices[camera].focuserDevice;
        if (focuser === undefined || focuser === null) {
            throw new Error("No focuser selected");
        }
        if (!hasKey(this.currentStatus.config.settings, focuser)) {
            throw new Error("Invalid focuser");
        }

        const settings = this.currentStatus.config.settings[focuser];
        return {
            camera, focuser, settings
        }
    }

    // Adjust the focus
    private async doFocus(ct: CancellationToken):Promise<number> {
        const config = this.getCurrentConfiguration();
        this.currentStatus.current.camera = config.camera;
        this.currentStatus.current.focuser = config.focuser;

        const amplitude = config.settings.range;
        const stepCount = config.settings.steps;
        const data:Array<number[]> = [];

        // Find focuser & camera.
        const connection = this.indiManager.getValidConnection();
        const focuserId = config.focuser;
        
        // check device connected
        const focuser = connection.getDevice(focuserId);
        if (!focuser.isConnected()) {
            throw new Error("Focuser not connected");
        }
        if (!connection.getDevice(config.camera).isConnected()) {
            throw new Error("Camera not connected");
        }
        // Move to the starting point
        const absPos = focuser.getVector('ABS_FOCUS_POSITION');
        if (!absPos.isReadyForOrder()) {
            throw new Error("Focuser is not ready");
        }

        let initialPos:number = parseFloat(absPos.getPropertyValue("FOCUS_ABSOLUTE_POSITION"));
        let lastKnownPos:number = initialPos;
        const start = config.settings.targetCurrentPos
                ? lastKnownPos
                : config.settings.targetPos;

        console.log('start pos is ' + start);
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
            console.log('AUTOFOCUS: moving focuser to ' + target);
            if ((intermediate !== undefined) && (intermediate !== target)) {
                // Account for backlash
                console.log('Focuser moving with backlash to : ', intermediate, target);
                await this.rawMoveFocuser(ct, focuserId, intermediate);
            }

            // Direct move
            console.log('Focuser moving to : ', target);
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
            
            console.log('AUTOFOCUS: shoot start');
            const shootResult = await this.camera.doShoot(ct, config.camera,
                        (settings)=>({
                            ...settings,
                            prefix: 'focus_ISO8601_step_' + Math.floor(currentStep)
                        }));
        
            const moveFocuserPromise = done(nextStep()) ? undefined : moveFocuser(nextStep());
            try {
                const starFieldResponse = await this.imageProcessor.compute(ct, {
                    starField: { source: { path: shootResult.path }}
                });
                
                const starField = starFieldResponse.stars;
                console.log('AUTOFOCUS: got starfield');
                console.log('StarField', JSON.stringify(starField, null, 2));
                let fwhm;
                if (starField.length) {
                    fwhm = 0;
                    for(let star of starField) {
                        fwhm += star.fwhm;
                    }
                    fwhm /= starField.length;

                } else {
                    fwhm = null;
                    // Testing...
                    // if (Math.random() < 0.1) {
                    //     fwhm = null;
                    // } else {
                    //     fwhm = 1.6 + Math.abs(currentStep - 3280)/1000.0 + Math.random() * 0.5;
                    // }
                }

                if (fwhm !== null) {
                    data.push( [currentStep, fwhm ]);
                }

                this.currentStatus.current.points[currentStep] = {
                    fwhm: fwhm
                };

                currentStep = nextStep();
                console.log('AUTOFOCUS: next step - ' + currentStep);
                stepId++;
            } finally {
                await moveFocuserPromise;
            }
        }

        if (data.length < 5) {
            console.log('Could not find best position. Moving back to origin');
            await moveFocuser(initialPos);
            throw new Error("Not enough data for focus");
        }
        
        console.log('regression with :' + JSON.stringify(data));
        const result = new PolynomialRegression(data.map(e=>e[0]), data.map(e=>e[1]), 4);
        // This is ugly. but works
        const precision = Math.min(Math.abs(lastStep - firstStep), 128);
        let bestValue = undefined;
        let bestPos;
        for(let i = 0; i <= precision; ++i) {
            const pos = firstStep + i === 0 ? i : i * (lastStep - firstStep) / precision;
            const pred = result.predict(pos);
            console.log('predict: '  + JSON.stringify(pred));
            const valueAtPos = pred;
            this.currentStatus.current.predicted[pos] = {
                fwhm: valueAtPos
            };
            if (i === 0 || bestValue > valueAtPos) {
                bestValue = valueAtPos;
                bestPos = pos;
            }
        }
        console.log('Found best position at ' + bestPos);
        await moveFocuser(bestPos!);
        return bestPos!;
    }

    setCurrentCamera=async(ct:CancellationToken, message: {cameraDevice: string})=> {
        if (this.camera.currentStatus.availableDevices.indexOf(message.cameraDevice) === -1) {
            throw new Error("invalid camera");
        }
        this.currentStatus.selectedCamera = message.cameraDevice;
    }

    setCurrentFocuser=async(ct:CancellationToken, message: {focuserDevice: string, cameraDevice?:string})=> {
        if (message.cameraDevice === undefined) {
            if (this.currentStatus.selectedCamera === null) {
                throw new Error("No camera selected");
            }
            message.cameraDevice = this.currentStatus.selectedCamera;
        }
        
        if (this.camera.currentStatus.availableDevices.indexOf(message.cameraDevice) === -1) {
            throw new Error("invalid camera");
        }
        
        if (!hasKey(this.camera.currentStatus.dynStateByDevices, message.cameraDevice)) {
            throw new Error("Camera conf not ready");
        }

        if (this.currentStatus.availableFocusers.indexOf(message.focuserDevice) === -1) {
            throw new Error("Invalid focuser");
        }
        this.camera.currentStatus.dynStateByDevices[message.cameraDevice].focuserDevice = message.focuserDevice;
    }

    updateCurrentSettings=async(ct:CancellationToken, message:FocuserUpdateCurrentSettingsRequest)=>
    {
        const config = this.getCurrentConfiguration();

        const newSettings = JsonProxy.applyDiff(config.settings, message.diff);
        // FIXME: do the checking !
        this.currentStatus.config.settings[config.focuser] = newSettings;
    }

    focus=async(ct:CancellationToken, message:{}):Promise<number>=>{
        console.log('API focus called');
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
