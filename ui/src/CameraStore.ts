import { defaultMemoize } from 'reselect';

import * as Store from './Store';
import * as BackendRequest from "./BackendRequest";
import CancellationToken from 'cancellationtoken';
import { BackendAccessorImpl } from './utils/BackendAccessor';
import * as Accessor from './shared/AccessPath';
import { CameraDeviceSettings } from '@bo/BackOfficeStatus';


class CameraDeviceSettingsAccessor extends BackendAccessorImpl<CameraDeviceSettings> {
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

export const cameraDeviceSettingsAccessor = (imagingSetup: string|null)=>new CameraDeviceSettingsAccessor(imagingSetup);

class CurrentImagingSetupAccessor implements Store.Accessor<string|null> {
    fromStore = (store:Store.Content)=> {
        const ret = store.backend?.camera?.currentImagingSetup;
        if (ret === undefined) return null;
        return ret;
    }

    send = async (imagingSetup: string|null) => {
        await BackendRequest.RootInvoker("camera")("setCurrentImagingSetup")(
            CancellationToken.CONTINUE,
            {
                imagingSetup
            }
        );
    }
}

export const currentImagingSetupAccessor = defaultMemoize(()=>new CurrentImagingSetupAccessor());

class DefaultImageLoadingPathAccessor implements Store.Accessor<string|null> {
    fromStore = (store:Store.Content)=> {
        const ret = store.backend?.camera?.defaultImageLoadingPath;
        if (ret === undefined) return null;
        return ret;
    }

    send = async (defaultImageLoadingPath: string|null) => {
        await BackendRequest.RootInvoker("camera")("setDefaultImageLoadingPath")(
            CancellationToken.CONTINUE,
            {
                defaultImageLoadingPath
            }
        );
    }
}

export const defaultImageLoadingPathAccessor = defaultMemoize(()=>new DefaultImageLoadingPathAccessor());


