import * as Store from './Store';
import { defaultMemoize } from 'reselect';

import * as BackendRequest from "./BackendRequest";
import CancellationToken from 'cancellationtoken';
import { BackendAccessorImpl, RecursiveBackendAccessor } from './utils/BackendAccessor';
import { AstrometrySettings } from '@bo/BackOfficeStatus';
import * as AccessPath from './utils/AccessPath';

class CurrentImagingSetupAccessor implements Store.Accessor<string|null> {
    fromStore = (store:Store.Content)=> {
        const ret = store.backend?.astrometry?.currentImagingSetup;
        if (ret === undefined) return null;
        return ret;
    }

    send = async (imagingSetup: string|null) => {
        await BackendRequest.RootInvoker("astrometry")("setCurrentImagingSetup")(
            CancellationToken.CONTINUE,
            {
                imagingSetup
            }
        );
    }
}


export const currentImagingSetupAccessor = defaultMemoize(()=>new CurrentImagingSetupAccessor());

export default class AstrometryBackendAccessor extends BackendAccessorImpl<AstrometrySettings> {
    constructor() {
        super(AccessPath.For((e)=>e.astrometry!.settings));
    }

    public apply = async (jsonDiff:any):Promise<void>=>{
        await BackendRequest.RootInvoker("astrometry")("updateCurrentSettings")(
            CancellationToken.CONTINUE,
            {diff: jsonDiff}
        );
    }
}

export const astrometrySettingsAccessor = defaultMemoize(()=>new AstrometryBackendAccessor());