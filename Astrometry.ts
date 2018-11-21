import * as Promises from './Promises';
import ImageProcessor from './ImageProcessor';
import {CameraStatus, ShootResult, ShootSettings, AstrometryComputeRequest, AstrometryCancelRequest} from './shared/BackOfficeStatus';
import {AstrometryStatus, AstrometryResult} from './shared/ProcessorTypes';
const {IndiConnection, timestampToEpoch} = require('./Indi');


// Astrometry requires: a camera, a mount
// It uses the first camera and the first mount (as Focuser)
export default class Astrometry {
    appStateManager: any;
    currentStatus: AstrometryStatus;
    imageProcessor: ImageProcessor;
    currentProcess: Promises.Cancelable<any, any>|null = null;

    constructor(app:any, appStateManager:any, context:any) {
        this.appStateManager = appStateManager;
        
        const initialStatus: AstrometryStatus = {
            status: "empty",
            errorDetails: null,
            image: null,
            result: null
        };

        this.appStateManager.getTarget().astrometry = initialStatus;
        this.currentStatus = this.appStateManager.getTarget().astrometry;
        this.imageProcessor = context.imageProcessor;
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

            const setStatus = (status: AstrometryStatus['status'], error:string|null, result:AstrometryResult|null)=> {
                if (this.currentProcess === newProcess) {
                    this.currentProcess = null;
                    this.currentStatus.status = status;
                    this.currentStatus.errorDetails = error;
                }
            };

            newProcess.onCancel(()=>setStatus('empty', null, null));
            newProcess.onError((e)=>setStatus('error', e.message || '' + e, null));
            newProcess.then((e:AstrometryResult)=>setStatus('ready', null, e));
            setStatus('computing', null, null);
            this.currentStatus.image = message.image;
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
