const PolynomialRegression = require('ml-regression-polynomial');
import CancellationToken from 'cancellationtoken';
import { ExpressApplication, AppContext } from "./ModuleBase";
const Obj = require('./Obj.js');
const ConfigStore = require('./ConfigStore');
import JsonProxy from './JsonProxy';
import { BackofficeStatus, AutoFocusStatus, FocuserStatus, FocuserUpdateCurrentSettingsRequest } from './shared/BackOfficeStatus';
import { Task, createTask } from './Task';

class Focuser {
    readonly appStateManager: JsonProxy<BackofficeStatus>;
    readonly currentStatus: FocuserStatus;
    currentPromise: Task<number>|null;
    camera: import("/home/ludovic/WebstormProjects/IPhd/Camera").default;
    indiManager: import("/home/ludovic/WebstormProjects/IPhd/IndiManager").default;
    imageProcessor: import("/home/ludovic/WebstormProjects/IPhd/ImageProcessor").default;
    constructor(app:ExpressApplication, appStateManager:JsonProxy<BackofficeStatus>, context:AppContext)
    {
        this.appStateManager = appStateManager;
        this.appStateManager.getTarget().focuser = {
            selectedDevice: null,
            preferedDevice: null,
            availableDevices: [],

            currentSettings: {
                range: 1000,
                steps: 5,
                backlash: 200,
                lowestFirst: false,
                targetCurrentPos: true,
                targetPos: 10000
            },

            current: {
                status: 'idle',
                error: null,
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
        new ConfigStore(appStateManager, 'focuser', ['focuser', 'currentSettings'], {
                range: 1000,
                steps: 10,
                backlash: 200,
                lowestFirst: false,
                targetCurrentPos: true,
                targetPos: 10000
            }, {
                range: 1000,
                steps: 10,
                backlash: 200,
                lowestFirst: false,
                targetCurrentPos: false,
                targetPos: 40000
            });
        this.currentPromise = null;
        this.resetCurrent('idle');
        this.camera = context.camera;
        this.indiManager = context.indiManager;
        this.imageProcessor = context.imageProcessor;

    }

    resetCurrent(status: AutoFocusStatus['status'])
    {
        this.currentStatus.current = {
            status: status,
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


    // Adjust the focus
    async focus(ct: CancellationToken, shootDevice:string):Promise<number> {
        
        const amplitude = this.currentStatus.currentSettings.range;
        const stepCount = this.currentStatus.currentSettings.steps;
        const data:Array<number[]> = [];

        // FIXME: find a camera

        // Find a focuser.
        const connection = this.indiManager.getValidConnection();
        const availableFocusers = connection.getAvailableDeviceIdsWith(['ABS_FOCUS_POSITION']);
        availableFocusers.sort();
        if (availableFocusers.length == 0) {
            throw new Error("No focuser available");
        }
        const focuserId = availableFocusers[0];

        // Move to the starting point
        const focuser = this.indiManager.getValidConnection().getDevice(focuserId);
        const absPos = focuser.getVector('ABS_FOCUS_POSITION');
        if (!absPos.isReadyForOrder()) {
            throw new Error("Focuser is not ready");
        }

        let initialPos:number = parseFloat(absPos.getPropertyValue("FOCUS_ABSOLUTE_POSITION"));
        let lastKnownPos:number = initialPos;
        const start = this.currentStatus.currentSettings.targetCurrentPos
                ? lastKnownPos
                : this.currentStatus.currentSettings.targetPos;

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

        const moveForward = this.currentStatus.currentSettings.lowestFirst;
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

            const backlash = this.currentStatus.currentSettings.backlash;
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
            const shootResult = await this.camera.shoot(ct, shootDevice,
                        (settings)=>({
                            ...settings,
                            prefix: 'focus_ISO8601_step_' + Math.floor(currentStep)
                        }));
        
            const moveFocuserPromise = done(nextStep()) ? undefined : moveFocuser(nextStep());
            try {
                const starFieldResponse = await this.imageProcessor.compute(ct, {
                    "starField":{ "source": { "path": shootResult.path}}
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
        const precision = Math.ceil(stepSize / 7);
        let bestValue = undefined;
        let bestPos;
        for(let i = 0; i <= precision; ++i) {
            const pos = firstStep + i * (lastStep - firstStep) / precision;
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

    $api_updateCurrentSettings=async(ct:CancellationToken, message:FocuserUpdateCurrentSettingsRequest)=>
    {
        const newSettings = JsonProxy.applyDiff(this.currentStatus.currentSettings, message.diff);
        // FIXME: do the checking !
        this.currentStatus.currentSettings = newSettings;
    }

    $api_focus=async(ct:CancellationToken, message:{}):Promise<number>=>{
        console.log('API focus called');
        return await createTask<number>(ct, async (task)=>{
            if (this.currentPromise !== null) {
                throw new Error("Focus already started");
            }
            this.currentPromise = task;

            try {
                this.resetCurrent('running');
                if (this.camera.currentStatus.selectedDevice === null) {
                    throw new Error("Select a camera first");
                }
                const ret:number = await this.focus(task.cancellation, this.camera.currentStatus.selectedDevice);
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

    $api_abort=async(ct:CancellationToken, message: {})=>{
        if (this.currentPromise !== null) {
            this.currentPromise.cancel();
        }
    }
}

module.exports = {Focuser}
