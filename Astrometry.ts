import CancellationToken from 'cancellationtoken';
import Log from './Log';
import * as BackOfficeAPI from './shared/BackOfficeAPI';
import * as RequestHandler from './RequestHandler';
import ConfigStore from './ConfigStore';
import { ExpressApplication, AppContext } from "./ModuleBase";
import { AstrometryStatus, BackofficeStatus, AstrometryWizard, AstrometrySettings } from './shared/BackOfficeStatus';
import { AstrometryResult, ProcessorAstrometryRequest } from './shared/ProcessorTypes';
import JsonProxy from './shared/JsonProxy';
import { IndiConnection } from './Indi';
import SkyProjection from './SkyAlgorithms/SkyProjection';
import {Task, createTask} from "./Task";
import Wizard from "./Wizard";
import PolarAlignmentWizard from "./PolarAlignmentWizard";
import MeridianFlipWizard from './MeridianFlipWizard';

const logger = Log.logger(__filename);

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
    },
    meridianFlip: {
        clearPhdCalibration: false,
    },
    preferedScope: null,
    preferedImagingSetup: null,
});

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
            result: null,
            selectedScope: null,
            target: null,
            settings: defaultSettings(),
            narrowedField: null,
            useNarrowedSearchRadius: false,
            runningWizard: null,
            currentImagingSetup: null,
        };

        this.appStateManager.getTarget().astrometry = initialStatus;
        this.currentStatus = this.appStateManager.getTarget().astrometry;
        this.context = context;

        new ConfigStore<AstrometrySettings>(appStateManager, 'astrometry', ['astrometry', 'settings'],
            defaultSettings(),
            defaultSettings(),
            (c)=>{
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
            this.currentStatus.scopeDetails = e.message || (""+e);
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

    compute = async(ct: CancellationToken, message:BackOfficeAPI.AstrometryComputeRequest)=>{
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
            };

            let result: AstrometryResult;

            this.currentProcess = task;
            try {
                this.currentStatus.image = message.image;
                this.currentStatus.scopeMovedSinceImage = false;
                this.currentStatus.status = 'computing';
                this.currentStatus.result = null;
                this.currentStatus.target = null;
                this.currentStatus.lastOperationError = null;

                const astrometry:ProcessorAstrometryRequest = {
                    "exePath": "",
                    "libraryPath": "",
                    "fieldMin":
                        this.currentStatus.narrowedField !== null && !message.forceWide
                            ? this.currentStatus.narrowedField * 100 / (100 + this.currentStatus.settings.narrowedFieldPercent)
                            : this.currentStatus.settings.initialFieldMin,
                    "fieldMax":
                        this.currentStatus.narrowedField !== null && !message.forceWide
                            ? this.currentStatus.narrowedField * (100 + this.currentStatus.settings.narrowedFieldPercent) / 100
                            : this.currentStatus.settings.initialFieldMax,
                    "raCenterEstimate": 0,
                    "decCenterEstimate": 0,
                    "searchRadius": 180,
                    "numberOfBinInUniformize": 10,
                    "source": {
                        "source": { 
                            "path": message.image,
                            streamId: "",
                        }
                    }
                }

                if (this.currentStatus.settings.useMountPosition) {
                    // Use scope position, with either small or large radius
                    try {
                        const targetScope = this.currentStatus.selectedScope;
                        if (!targetScope) {
                            throw new Error('No mount selected');
                        }
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
                        astrometry.raCenterEstimate = j2000Center[0];
                        astrometry.decCenterEstimate = j2000Center[1];
                        const radius = this.currentStatus.useNarrowedSearchRadius && !message.forceWide
                            ? this.currentStatus.settings.narrowedSearchRadius
                            : this.currentStatus.settings.initialSearchRadius;

                        astrometry.searchRadius = radius !== null ? radius : 180;

                    } catch(e) {
                        logger.warn('Astrometry problem with mount - doing wide scan', e);
                    }
                }

                logger.info('Starting astrometry', {astrometry});
                result = await this.imageProcessor.compute(task.cancellation, {astrometry});
            } catch(e) {
                if (e instanceof CancellationToken.CancellationError) {
                    finish('empty', null, null);
                } else {
                    finish('error', e.message || '' + e, null);
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
                    finish('idle', e.message || ('' + e));
                }
                throw e;
            }
            finish('idle', null);
        });
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

    sync = async (ct: CancellationToken, message: {})=>{
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

            logger.info('Astrometry: sync');

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

                const skyProjection = SkyProjection.fromAstrometry(this.currentStatus.result);

                // take the center of the image
                const center = [(this.currentStatus.result.width - 1) / 2, (this.currentStatus.result.height - 1) / 2];
                // Project to J2000
                const [ra2000, dec2000] = skyProjection.pixToRaDec(center);
                // compute JNOW center for last image.
                const [ranow, decnow] = SkyProjection.raDecEpochFromJ2000([ra2000, dec2000], Date.now());

                await this.doSync(task.cancellation, targetScope, {ra: ranow, dec:decnow});
            } catch(e) {
                if (e instanceof CancellationToken.CancellationError) {
                    finish('idle', null)
                } else {
                    finish('idle', e.message || ('' + e));
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

