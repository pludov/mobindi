import { defaultMemoize } from 'reselect';
import CancellationToken from 'cancellationtoken';

import * as Store from './Store';
import Log from './shared/Log';
import * as IndiStore from "./IndiStore";
import * as BackendRequest from "./BackendRequest";
import * as AccessPath from './shared/AccessPath';

import * as BackOfficeStatus from '@bo/BackOfficeStatus';
import { BackendAccessorImpl } from './utils/BackendAccessor';

const logger = Log.logger(__filename);

class FocuserSettingsAccessor extends BackendAccessorImpl<BackOfficeStatus.FocuserSettings> {
    private imagingSetupUid:string;

    constructor(imagingSetupUid: string) {
        super(AccessPath.For((e)=>e.imagingSetup!.configuration.byuuid[imagingSetupUid].focuserSettings))
        this.imagingSetupUid = imagingSetupUid;
    }

    apply = async (jsonDiff:any)=>{
        logger.debug('Sending changes' , {jsonDiff});
        await BackendRequest.RootInvoker("imagingSetupManager")("updateCurrentSettings")(
            CancellationToken.CONTINUE,
            {
                imagingSetupUuid: this.imagingSetupUid,
                diff: {
                    update: {
                        focuserSettings: jsonDiff
                    }
                }
            }
        );
    }
}

export const focuserSettingsAccessor = (imagingSetupUid:string)=>new FocuserSettingsAccessor(imagingSetupUid);

class CurrentImagingSetupAccessor implements Store.Accessor<string|null> {
    fromStore = (store:Store.Content)=> {
        const ret = store.backend?.focuser?.currentImagingSetup;
        if (ret === undefined) return null;
        return ret;
    }

    send = async (imagingSetup: string|null) => {
        await BackendRequest.RootInvoker("focuser")("setCurrentImagingSetup")(
            CancellationToken.CONTINUE,
            {
                imagingSetup
            }
        );
    }
}

export const currentImagingSetupAccessor = defaultMemoize(()=>new CurrentImagingSetupAccessor());


export function isFocuserBusy(state: Store.Content, focuserId: string)
{
    const vec = IndiStore.getVector(state, focuserId, 'ABS_FOCUS_POSITION');
    console.log('What about ', vec);
    if (vec !== null && vec.$state === "Busy") {
        return true;
    }
    return false;
}