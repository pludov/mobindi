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

export type FocusDelta = {
    fromRef: number;
    fromCur: number;
}

function getFilterAdjustment(focuserFilterAdjustment: BackOfficeStatus.FilterWheelDeltas, filter:string|null) {
    if (filter === null) {
        throw new Error("Invalid filter: null");
    }
    if (!Object.prototype.hasOwnProperty.call(focuserFilterAdjustment, filter)) {
        throw new Error("Unknown filter reference : " + filter);
    }

    return focuserFilterAdjustment[filter];
}


export function getFocusDelta(imagingSetupDynState: BackOfficeStatus.ImagingSetupDynState,
                              focusStepPerDegree: null|number,
                              focuserFilterAdjustment: BackOfficeStatus.FilterWheelDeltas,
                              temperatureProperty: null|BackOfficeStatus.IndiPropertyIdentifier): FocusDelta
{
    if (imagingSetupDynState.curFocus === null) {
        throw new Error("Missing current state");
    }

    if (imagingSetupDynState.refFocus === null) {
        throw new Error("Missing reference state");
    }

    let delta = 0;

    if (focusStepPerDegree !== null && focusStepPerDegree !== undefined && temperatureProperty !== null) {
        // Account for temperature change
        if (imagingSetupDynState.refFocus.temp === null) {
            throw new Error("No temperature reference");
        }

        if (imagingSetupDynState.curFocus.temp === null) {
            throw new Error("Current temperature not known");
        }

        const tempDelta = focusStepPerDegree * (imagingSetupDynState.curFocus.temp - imagingSetupDynState.refFocus.temp);
        delta += tempDelta;
    }

    if (imagingSetupDynState.refFocus.filter !== imagingSetupDynState.curFocus.filter) {
        const ref = getFilterAdjustment(focuserFilterAdjustment, imagingSetupDynState.refFocus.filter);
        const curr = getFilterAdjustment(focuserFilterAdjustment, imagingSetupDynState.curFocus.filter);

        const filterDelta = curr - ref;
        delta += filterDelta;
    }

    return {
        fromRef: delta,
        fromCur: imagingSetupDynState.refFocus.position + delta - imagingSetupDynState.curFocus.position
    }
}
