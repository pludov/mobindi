import * as BackOfficeStatus from '@bo/BackOfficeStatus';

export type FocusDelta = {
    fromRef: number;
    fromCur: number;
    abs: number;
}

function getFilterAdjustment(focuserFilterAdjustment: BackOfficeStatus.FilterWheelDeltas, filter:string|null) {
    if (filter === null) {
        throw new Error("Invalid filter: null");
    }
    if (!Object.prototype.hasOwnProperty.call(focuserFilterAdjustment, filter)) {
        throw new Error("Missing filter reference : " + filter);
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
        fromCur: imagingSetupDynState.refFocus.position + delta - imagingSetupDynState.curFocus.position,
        abs: imagingSetupDynState.refFocus.position + delta,
    }
}
