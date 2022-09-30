import { IndiDevice, IndiVector } from '@bo/BackOfficeStatus';
import * as Store from "./Store";
import { hasKey } from './shared/Obj';
import * as BackendRequest from "./BackendRequest";
import { UpdateIndiVectorRequest } from '@bo/BackOfficeAPI';
import CancellationToken from 'cancellationtoken';

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

export async function updateVectorProp(dev: string, vec: string, propertyId: string, value: string) {
    const req:UpdateIndiVectorRequest = {
        dev: dev,
        vec: vec,
        children: [{
            name: propertyId,
            value
        }]
    };

    await BackendRequest.RootInvoker("indi")("updateVector")(
        CancellationToken.CONTINUE,
        req
    );
}
