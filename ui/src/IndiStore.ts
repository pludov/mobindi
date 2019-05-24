import { IndiDevice, IndiVector } from '@bo/BackOfficeStatus';
import * as Store from "./Store";
import { hasKey } from './shared/Obj';

export function getDevice(state:Store.Content, deviceId: string): IndiDevice|null {
    const indi = state.backend.indiManager;
    if (!indi) {
        return null;
    }
    if (!hasKey(indi.deviceTree, deviceId)) {
        return null;
    }
    return indi.deviceTree[deviceId];
}

export function getVector(state:Store.Content, deviceId: string, vectorId: string): IndiVector|null {
    const dev = getDevice(state, deviceId);
    if (dev === null) {
        return null;
    }
    if (!hasKey(dev, vectorId)) {
        return null;
    }
    return dev[vectorId];
}