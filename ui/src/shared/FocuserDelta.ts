import * as BackOfficeStatus from '@bo/BackOfficeStatus';

export type FocusDelta = {
    fromRef: number;
    fromCur: number;
    fromCurWeight: number;  // 0 when exact match. >= 1 for delta over tolerance
    abs: number; // Ideal value (absolute)
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


export type FocusDeltaParameters = {
    curFocus: BackOfficeStatus.FocuserPoint|null;
    refFocus: BackOfficeStatus.FocuserPoint|null;
    focusStepPerDegree: null|number;
    focusStepTolerance: number;
    focuserFilterAdjustment: BackOfficeStatus.FilterWheelDeltas;
    temperatureProperty: null|BackOfficeStatus.IndiPropertyIdentifier;
}

export function getFocusDelta(param : FocusDeltaParameters): FocusDelta
{
    const {curFocus, refFocus, focusStepPerDegree, focusStepTolerance, focuserFilterAdjustment, temperatureProperty} = {...param};

    if (curFocus === null) {
        throw new Error("Missing current state");
    }

    if (refFocus === null) {
        throw new Error("Missing reference state");
    }

    let delta = 0;

    if (focusStepPerDegree !== null && focusStepPerDegree !== undefined && temperatureProperty !== null) {
        // Account for temperature change
        if (refFocus.temp === null) {
            throw new Error("No temperature reference");
        }

        if (curFocus.temp === null) {
            throw new Error("Current temperature not known");
        }

        const tempDelta = focusStepPerDegree * (curFocus.temp - refFocus.temp);
        delta += tempDelta;
    }

    if (refFocus.filter !== curFocus.filter) {
        const ref = getFilterAdjustment(focuserFilterAdjustment, refFocus.filter);
        const curr = getFilterAdjustment(focuserFilterAdjustment, curFocus.filter);

        const filterDelta = curr - ref;
        delta += filterDelta;
    }

    const fromCur = refFocus.position + delta - curFocus.position;
    const fromCurWeight = focusStepTolerance >= 1 ? Math.abs(fromCur) / focusStepTolerance : fromCur == 0 ? 0 : 1;
    return {
        fromRef: delta,
        fromCur,
        fromCurWeight,
        abs: refFocus.position + delta,
    }
}
