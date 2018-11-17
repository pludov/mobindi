import * as Promises from './Promises';
import {CameraStatus, ShootResult, ShootSettings, AstrometryStatus, AstrometryComputeRequest} from './shared/BackOfficeStatus';
const {IndiConnection, timestampToEpoch} = require('./Indi');


// Astrometry requires: a camera, a mount
// It uses the first camera and the first mount (as Focuser)
export default class Astrometry {
    appStateManager: any;
    currentStatus: AstrometryStatus;
    imageProcessor: any;

    constructor(app:any, appStateManager:any, context:any) {
        this.appStateManager = appStateManager;
        
        const initialStatus: AstrometryStatus = {
            status: "empty",
            image: null,
            result: null
        };

        this.appStateManager.getTarget().astrometry = initialStatus;
        this.currentStatus = this.appStateManager.getTarget().astrometry;
        this.imageProcessor = context.imageProcessor;
    }

    $api_compute(message:AstrometryComputeRequest, progress:any) {
        return new Promises.Builder(()=> {
            console.log('Astrometry: compute for ' + message.image);
            return this.imageProcessor.compute({
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
        });
    }
}

