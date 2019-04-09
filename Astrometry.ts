import CancellationToken from 'cancellationtoken';
import * as BackOfficeAPI from './shared/BackOfficeAPI';
import * as RequestHandler from './RequestHandler';
import { ExpressApplication, AppContext } from "./ModuleBase";
import { AstrometryStatus, BackofficeStatus } from './shared/BackOfficeStatus';
import { AstrometryResult, ProcessorAstrometryRequest } from './shared/ProcessorTypes';
import JsonProxy from './JsonProxy';
import { DriverInterface, IndiConnection } from './Indi';
import SkyProjection from './ui/src/utils/SkyProjection';
import {Task, createTask} from "./Task.js";

// Astrometry requires: a camera, a mount
// It uses the first camera and the first mount (as Focuser)
export default class Astrometry implements RequestHandler.APIAppProvider<BackOfficeAPI.AstrometryAPI>{
    appStateManager: JsonProxy<BackofficeStatus>;
    readonly context: AppContext;
    currentStatus: AstrometryStatus;
    currentProcess: Task<any>|null = null;
    get imageProcessor() { return this.context.imageProcessor };


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
            availableScopes: [],
            selectedScope: null,
            target: null,
            settings: {
                initialFieldMin: 0.2,
                initialFieldMax: 5,
                useMountPosition: true,
                initialSearchRadius: 30,
                narrowedSearchRadius: 4,
                narrowedFieldPercent: 25
            },
            narrowedField: null,
            useNarrowedSearchRadius: false,
        };

        this.appStateManager.getTarget().astrometry = initialStatus;
        this.currentStatus = this.appStateManager.getTarget().astrometry;
        this.context = context;

        context.indiManager.createDeviceListSynchronizer((devs:string[])=> {
            this.currentStatus.availableScopes = devs;
        }, undefined, DriverInterface.TELESCOPE);

        // listener to adjust scopeStatus (only when ok/ko)
        this.appStateManager.addSynchronizer([
            [
                [   'indiManager', 'deviceTree', null, 'CONNECTION', 'childs', 'CONNECT' ],
                [   'astrometry', 'selectedScope' ]
            ]
        ],
            this.syncScopeStatus, true

        );
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
            compute: this.compute,
            cancel: this.cancel,
            setScope: this.setScope,
            goto: this.goto,
            sync: this.sync,
        }
    }

    updateCurrentSettings = async (ct: CancellationToken, payload: {diff: any}) => {
        const newSettings = JsonProxy.applyDiff(this.currentStatus.settings, payload.diff);
        // FIXME: do the checking !
        this.currentStatus.settings = newSettings;
    }

    compute = async(ct: CancellationToken, message:BackOfficeAPI.AstrometryComputeRequest)=>{
        return await createTask<AstrometryResult>(ct, async (task) => {
            console.log('Astrometry: compute for ' + message.image);
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
                        "source": { "path": message.image}
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
                        console.log('Astrometry problem with mount - doing wide scan', e);
                    }
                }

                console.log('Starting astrometry with ' + JSON.stringify(astrometry));
                result = await this.imageProcessor.compute(ct, {astrometry}) as AstrometryResult;
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
        if (this.currentStatus.availableScopes.indexOf(message.deviceId) === -1) {
            throw new Error("device not available");
        }
        this.currentStatus.selectedScope = message.deviceId;
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

            console.log('Astrometry: goto');
            this.currentProcess = task;
            try {
                this.currentStatus.scopeStatus = 'moving';
                this.currentStatus.scopeMovedSinceImage = true;
                this.currentStatus.lastOperationError = null;
                this.currentStatus.target = {ra:message.ra, dec:message.dec};

                // check no motion is in progress
                await this.context.indiManager.setParam(
                        task.cancellation,
                        targetScope,
                        'ON_COORD_SET',
                        {'TRACK': 'On'},
                        true,
                        true);

                await this.context.indiManager.setParam(
                        task.cancellation,
                        targetScope,
                        'EQUATORIAL_EOD_COORD',
                        {
                            'RA': ''+ message.ra * 24 / 360,
                            'DEC': '' + message.dec,
                        },
                        true,
                        true,
                        // Aborter...
                        (connection:IndiConnection, devId:string)=>{
                            console.log('Cancel requested');
                            const dev = connection.getDevice(devId);
                            const vec = dev.getVector("TELESCOPE_ABORT_MOTION")
                            vec.setValues([{name:"ABORT", value:"On"}]);
                        });

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

            console.log('Astrometry: sync');

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

                // Check that scope is connected
                this.context.indiManager.checkDeviceConnected(targetScope);

                // true,true=> check no motion is in progress
                await this.context.indiManager.setParam(
                        task.cancellation,
                        targetScope,
                        'ON_COORD_SET',
                        {'SYNC': 'On'},
                        true,
                        true);
                await this.context.indiManager.setParam(
                        task.cancellation,
                        targetScope,
                        'EQUATORIAL_EOD_COORD',
                        {
                            'RA': ''+ ranow * 24 / 360,
                            'DEC': '' + decnow,
                        },
                        true,
                        true);
            } catch(e) {
                if (e instanceof CancellationToken.CancellationError) {
                    finish('idle', null)
                } else {
                    finish('idle', e.message || ('' + e));
                }
                throw e;
            }
            this.currentStatus.useNarrowedSearchRadius = true;
            finish('idle', null);
        });
    }
}

