import { BackofficeStatus } from '@bo/BackOfficeStatus';
import * as Actions from "./Actions";
import * as Store from "./Store";
import * as IndiStore from "./IndiStore";
import * as BackendRequest from "./BackendRequest";
import * as JsonProxy from './shared/JsonProxy';
import { hasKey } from './shared/Obj';
import CancellationToken from 'cancellationtoken';


function getDynStateByDevice(state: Store.Content, filterWheelId: string)
{
    const fw = state.backend.filterWheel;
    if (!fw) {
        return null;
    }
    if (!hasKey(fw.dynStateByDevices, filterWheelId)) {
        return null;
    }
    return fw.dynStateByDevices[filterWheelId];
}

export function currentFilterId(state: Store.Content, filterWheelId: string)
{
    const dynState = getDynStateByDevice(state, filterWheelId);
    if (dynState === null) {
        return null;
    }
    if (dynState.currentFilterPos === null) {
        return null;
    }
    if (dynState.currentFilterPos < 1 || dynState.currentFilterPos > dynState.filterIds.length) {
        return "" + dynState.currentFilterPos;
    }
    return dynState.filterIds[dynState.currentFilterPos - 1];
}

export function currentTargetFilterId(state: Store.Content, filterWheelId: string)
{
    const dynState = getDynStateByDevice(state, filterWheelId);
    if (dynState === null) {
        return null;
    }
    let targetFilterPos = dynState.targetFilterPos;
    if (targetFilterPos === null) {
        targetFilterPos = dynState.currentFilterPos;
    }

    if (targetFilterPos === null) {
        return null;
    }
    if (targetFilterPos < 1 || targetFilterPos > dynState.filterIds.length) {
        return "" + dynState.currentFilterPos;
    }
    return dynState.filterIds[targetFilterPos - 1];
}

export async function changeFilter(filterWheelDeviceId: string, filterId: string)
{
     await BackendRequest.RootInvoker("filterWheel")("changeFilter")(CancellationToken.CONTINUE, {filterWheelDeviceId, filterId});

}

export function availableFilterIds(state: Store.Content, filterWheelId: string)
{
    const dynState = getDynStateByDevice(state, filterWheelId);
    if (dynState === null) {
        return null;
    }
    return dynState.filterIds;
}

export function isFilterWheelBusy(state: Store.Content, filterWheelId: string)
{
    const dynState = getDynStateByDevice(state, filterWheelId);
    if (dynState !== null && dynState.targetFilterPos !== null) {
        return true;
    }
    const vec = IndiStore.getVector(state, filterWheelId, 'FILTER_SLOT');
    if (vec !== null && vec.$state === "Busy") {
        return true;
    }
    return false;
}

export function hasFilterWheel(state: Store.Content): boolean {
    const fw = state.backend.filterWheel;
    if (!fw) {
        return false;
    }
    return !!fw.availableDevices.length;
}

