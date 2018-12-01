
import * as Promises from './Promises';
import ImageProcessor from './ImageProcessor';
import { ExpressApplication, AppContext } from "./ModuleBase";
import { AstrometryStatus, AstrometryComputeRequest, AstrometryCancelRequest, BackofficeStatus, AstrometrySetScopeRequest, AstrometrySyncScopeRequest, AstrometryGotoScopeRequest} from './shared/BackOfficeStatus';
import { AstrometryResult } from './shared/ProcessorTypes';
import JsonProxy from './JsonProxy';
import { DriverInterface, IndiConnection } from './Indi';
import SkyProjection from './ui/src/utils/SkyProjection';

// Astrometry requires: a camera, a mount
// It uses the first camera and the first mount (as Focuser)
export default class Astrometry {
    appStateManager: JsonProxy<BackofficeStatus>;
    readonly context: AppContext;
    currentStatus: AstrometryStatus;
    currentProcess: Promises.Cancelable<any, any>|null = null;
    get imageProcessor() { return this.context.imageProcessor };


    constructor(app:ExpressApplication, appStateManager:JsonProxy<BackofficeStatus>, context: AppContext) {
        this.appStateManager = appStateManager;

        const initialStatus: AstrometryStatus = {
            status: "empty",
            lastOperationError: null,
            scopeStatus: "idle",
            scopeReady: true,
            scopeDetails: "not initialised",
            image: null,
            result: null,
            availableScopes: [],
            selectedScope: null,
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

    $api_compute(message:AstrometryComputeRequest, progress:any) {
        return new Promises.Builder<void, void>(()=>{
            console.log('Astrometry: compute for ' + message.image);
            if (this.currentProcess !== null) {
                throw new Error("Astrometry already in process");
            }
            const newProcess = this.imageProcessor.compute({
                "astrometry": {
                    "exePath": "",
                    "libraryPath": "",
                    "fieldMin": 0.2,
                    "fieldMax": 5,
                    "raCenterEstimate": 0,
                    "decCenterEstimate": 0,
                    "searchRadius": 180,
                    "numberOfBinInUniformize": 10,
                    "source": {
                        "source": { "path": message.image}
                    }
                }
            });

            const finish = (status: AstrometryStatus['status'], error:string|null, result:AstrometryResult|null)=> {
                if (this.currentProcess === newProcess) {
                    this.currentProcess = null;
                    this.currentStatus.status = status;
                    this.currentStatus.lastOperationError = error;
                    this.currentStatus.result = result;
                }
            };

            newProcess.onCancel(()=>finish('empty', null, null));
            newProcess.onError((e:any)=>finish('error', e.message || '' + e, null));
            newProcess.then((e:AstrometryResult)=>finish('ready', null, e));
            this.currentProcess = newProcess;
            this.currentStatus.image = message.image;
            this.currentStatus.status = 'computing';
            this.currentStatus.result = null;
            this.currentStatus.lastOperationError = null;
            return newProcess;
        });
    }

    $api_cancel(message: AstrometryCancelRequest, progress:any) {
        return new Promises.Immediate<void, void>(()=>{
            if (this.currentProcess !== null) {
                this.currentProcess.cancel();
            }
        });
    }

    $api_setScope(message:AstrometrySetScopeRequest, progress:any) {
        return new Promises.Immediate(()=> {
            if (this.currentStatus.availableScopes.indexOf(message.deviceId) === -1) {
                throw "device not available";
            }
            this.currentStatus.selectedScope = message.deviceId;
        });
    }

    $api_goto(message:AstrometryGotoScopeRequest, progress: any) {
        return new Promises.Builder<void, void>(()=>{
            let newProcess:this['currentProcess'] = null;
            console.log('Astrometry: goto');
            if (this.currentProcess !== null) {
                throw new Error("Astrometry already in process");
            }

            const finish = (status: AstrometryStatus['scopeStatus'], error:string|null)=> {
                if (this.currentProcess === newProcess) {
                    this.currentProcess = null;
                    this.currentStatus.scopeStatus = status;
                    this.currentStatus.lastOperationError = error;
                }
            };

            try {
                const targetScope = this.currentStatus.selectedScope;
                if (!targetScope) {
                    throw new Error("No scope selected for astrometry");
                }

                // check no motion is in progress
                newProcess = new Promises.Chain<void, void>(
                    this.context.indiManager.setParam(
                        targetScope,
                        'ON_COORD_SET',
                        {'TRACK': 'On'},
                        true,
                        true),
                    this.context.indiManager.setParam(
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
                        }),
                );

            } catch(e) {
                finish('idle', e.message || '' + e);
                throw e;
            }
            newProcess.onCancel(()=>finish('idle', null));
            newProcess.onError((e:any)=>finish('idle', e.message || '' + e));
            newProcess.then(()=>finish('idle', null));
            this.currentProcess = newProcess;
            this.currentStatus.scopeStatus = 'moving';
            this.currentStatus.lastOperationError = null;
            return newProcess!;

        });
    }

    $api_sync(message:AstrometrySyncScopeRequest, progress:any) {
        return new Promises.Builder<void, void>(()=>{
            let newProcess:this['currentProcess'] = null;

            console.log('Astrometry: sync');
            if (this.currentProcess !== null) {
                throw new Error("Astrometry already in process");
            }

            const finish = (status: AstrometryStatus['scopeStatus'], error:string|null)=> {
                if (this.currentProcess === newProcess) {
                    this.currentProcess = null;
                    this.currentStatus.scopeStatus = status;
                    this.currentStatus.lastOperationError = error;
                }
            };

            try {
                if (this.currentStatus.result === null) {
                    throw new Error("Run astrometry first");
                }

                if (!this.currentStatus.result.found) {
                    throw new Error("Astrometry failed, cannot sync");
                }

                const skyProjection = SkyProjection.fromAstrometry(this.currentStatus.result);

                // take the center of the image
                const center = [(this.currentStatus.result.width - 1) / 2, (this.currentStatus.result.height - 1) / 2];
                // Project to J2000
                const [ra2000, dec2000] = skyProjection.pixToRaDec(center);
                // compute JNOW center for last image.
                const [ranow, decnow] = SkyProjection.raDecEpochFromJ2000([ra2000, dec2000], Date.now());


                const targetScope = this.currentStatus.selectedScope;
                if (!targetScope) {
                    throw new Error("No scope selected for astrometry");
                }

                // Check that scope is connected
                this.context.indiManager.checkDeviceConnected(targetScope);

                // true,true=> check no motion is in progress
                newProcess = new Promises.Chain<void, void>(
                    this.context.indiManager.setParam(
                        targetScope,
                        'ON_COORD_SET',
                        {'SYNC': 'On'},
                        true,
                        true),
                    this.context.indiManager.setParam(
                        targetScope,
                        'EQUATORIAL_EOD_COORD',
                        {
                            'RA': ''+ ranow * 24 / 360,
                            'DEC': '' + decnow,
                        },
                        true,
                        true),
                );

            } catch(e) {
                finish('idle', e.message || '' + e);
                throw e;
            }
            newProcess.onCancel(()=>finish('idle', null));
            newProcess.onError((e:any)=>finish('idle', e.message || '' + e));
            newProcess.then(()=>finish('idle', null));
            this.currentProcess = newProcess;
            this.currentStatus.scopeStatus = 'syncing';
            this.currentStatus.lastOperationError = null;
            return newProcess!;
        });
    }
}

