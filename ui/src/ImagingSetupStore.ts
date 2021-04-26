import CancellationToken from 'cancellationtoken';

import { ImagingSetup } from '@bo/BackOfficeStatus';
import * as Store from './Store';
import { BackendAccessorImpl } from './utils/BackendAccessor';

import * as BackendRequest from "./BackendRequest";
import * as Accessor from './utils/AccessPath';


class ImagingSetupAccessor extends BackendAccessorImpl<ImagingSetup> {
    private imagingSetup: string|null;
    constructor(imagingSetup: string|null) {
        super(Accessor.For((e)=>e.imagingSetup!.configuration.byuuid[imagingSetup!]));
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
                diff: jsonDiff
            }
        );
    }
}

export const imagingSetupAccessor = (imagingSetup: string|null)=>new ImagingSetupAccessor(imagingSetup);


// Move to a Store class
export const getImagingSetup = (store:Store.Content, imagingSetup: string|null)=> {
    if (imagingSetup === null) {
        return null;
    }
    const byuuid = store.backend?.imagingSetup?.configuration.byuuid;
    if (byuuid === undefined) {
        return null;
    }

    if (!Object.prototype.hasOwnProperty.call(byuuid, imagingSetup)) {
        return null;
    }

    return byuuid[imagingSetup];
}

