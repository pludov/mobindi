import { BackendAccessorImpl } from './utils/BackendAccessor';
import * as Accessor from './utils/AccessPath';
import * as BackendRequest from "./BackendRequest";
import CancellationToken from 'cancellationtoken';
import { CameraDeviceSettings } from '@bo/BackOfficeStatus';

// FIXME--: move to CameraStore
export default class CameraDeviceSettingsBackendAccessor extends BackendAccessorImpl<CameraDeviceSettings> {
    private imagingSetup: string|null;
    constructor(imagingSetup: string|null) {
        super(Accessor.For((e)=>e.imagingSetup!.configuration.byuuid[imagingSetup!].cameraSettings));
        this.imagingSetup = imagingSetup;
    }

    public apply = async (jsonDiff:any):Promise<void>=>{
        if (this.imagingSetup === null) {
            throw new Error("No imaging setup selected");
        }
        await BackendRequest.RootInvoker("imagingSetupManager")("updateCurrentSettings")(
            CancellationToken.CONTINUE,
            {
                imagingSetupUuid: this.imagingSetup,
                diff: {
                    update: {cameraSettings: jsonDiff}
                }
            }
        );
    }
}
