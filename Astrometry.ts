
import * as Promises from './Promises';
import ImageProcessor from './ImageProcessor';
import { ExpressApplication, AppContext } from "./ModuleBase";
import { AstrometryStatus, AstrometryComputeRequest, AstrometryCancelRequest, BackofficeStatus} from './shared/BackOfficeStatus';
import { AstrometryResult } from './shared/ProcessorTypes';
import JsonProxy from './JsonProxy';
const {IndiConnection, timestampToEpoch} = require('./Indi');


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
            errorDetails: null,
            image: null,
            result: null,
        };

        this.appStateManager.getTarget().astrometry = initialStatus;
        this.currentStatus = this.appStateManager.getTarget().astrometry;
        this.context = context;
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
                    this.currentStatus.errorDetails = error;
                }
            };

            newProcess.onCancel(()=>finish('empty', null, null));
            newProcess.onError((e:any)=>finish('error', e.message || '' + e, null));
            newProcess.then((e:AstrometryResult)=>finish('ready', null, e));
            this.currentProcess = newProcess;
            this.currentStatus.image = message.image;
            this.currentStatus.status = 'computing';
            this.currentStatus.errorDetails = null;
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
}

