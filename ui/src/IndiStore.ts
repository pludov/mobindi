import { IndiDevice, IndiManagerStatus, IndiProfilesConfiguration, IndiServerConfiguration, IndiVector } from '@bo/BackOfficeStatus';
import * as Store from "./Store";
import { count3D, hasKey } from './shared/Obj';
import * as BackendRequest from "./BackendRequest";
import { UpdateIndiVectorRequest } from '@bo/BackOfficeAPI';
import CancellationToken from 'cancellationtoken';
import { defaultMemoize } from 'reselect';
import { isArrayEqual, shallowEqual } from './Utils';
import * as IndiUtils from './IndiUtils';
import SkyProjection from './SkyAlgorithms/SkyProjection';

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

// Return the list of indidevices available, sorted
export function getDevices() {

    const deviceTreeToDevices = (deviceTree: undefined|IndiManagerStatus["deviceTree"]) => {
        if (!deviceTree) {
            return [];
        }
        return Object.keys(deviceTree).sort();
    }

    const memoizedDeviceTreeToDevices = defaultMemoize(deviceTreeToDevices, {
        resultEqualityCheck: isArrayEqual
    });

    return (state:Store.Content) => {
        const deviceTree = state.backend?.indiManager?.deviceTree;
        return memoizedDeviceTreeToDevices(deviceTree);
    };
};

export function getDrivers() {
    const indiServerConfigToDrivers = (config: undefined|IndiServerConfiguration['devices']) => {
        return Object.keys(config||{}).sort();
    }

    const memoizedIndiServerConfigToDrivers = defaultMemoize(indiServerConfigToDrivers, {
        resultEqualityCheck: isArrayEqual
    });

    return (state:Store.Content) => {
        const config = state.backend?.indiManager?.configuration?.indiServer?.devices;
        return memoizedIndiServerConfigToDrivers(config);
    };
}

export function getDevicesWithActiveProfile(): (state:Store.Content) => {[dev:string]: boolean} {

    const profileToDevices = (profile: undefined|IndiProfilesConfiguration["byUid"]) => {
        if (profile === undefined) {
            return {};
        }
        const ret:{[dev:string]: boolean} = {};
        for(const id of Object.keys(profile)) {
            if (!profile[id].active) {
                continue;
            }
            for(const dev of Object.keys(profile[id].keys)) {
                ret[dev] = true;
            }
        }
        return ret;
    }

    const memoizedProfileToDevices = defaultMemoize(profileToDevices, {
        resultEqualityCheck: shallowEqual
    });

    return (state:Store.Content) => {
        const profile = state.backend?.indiManager?.configuration?.profiles?.byUid;
        return memoizedProfileToDevices(profile);
    }
}

export function getDevicesMismatchStats(): (state:Store.Content) => {[dev:string]: number} {

    const profileToDevices = (profile: undefined|IndiManagerStatus["profileStatus"]) => {
        const ret:{[dev:string]: number} = {};
        if (profile === undefined) {
            return ret;
        }
        if (profile.totalMismatchCount === 0) {
            return ret;
        }

        const mismatches = profile.mismatches;
        for(const dev of Object.keys(mismatches)) {
            ret[dev] = count3D(mismatches, dev);;
        }
        return ret;
    }

    const memoizedProfileToDevices = defaultMemoize(profileToDevices, {
        resultEqualityCheck: shallowEqual
    });

    return (state:Store.Content) => {
        const profile = state.backend?.indiManager?.profileStatus;
        return memoizedProfileToDevices(profile);
    }
}

export function getMountGeoCoords(store: Store.Content, scope: string) {
    const vec = !scope ? undefined : IndiUtils.getVectorDesc(store, scope, "GEOGRAPHIC_COORD");

    const coords = [ vec?.childs.LAT?.$_, vec?.childs.LONG?.$_].map(IndiUtils.parsePropFloat);
    
    if (coords[0] === undefined || coords[1] === undefined) {
        return undefined;
    }

    return {lat: coords[0], long: coords[1]};
}

export function getMountPos(store: Store.Content, scope: string) {
    const coordVec = !scope ? undefined : IndiUtils.getVectorDesc(store, scope, 'EQUATORIAL_EOD_COORD');
    const coordRaDec = [ coordVec?.childs.RA?.$_, coordVec?.childs.DEC?.$_].map(IndiUtils.parsePropFloat);
    
    if (coordRaDec[0] === undefined || coordRaDec[1] === undefined) {
        return undefined;
    }

    return {ra : coordRaDec[0], dec: coordRaDec[1]};
}


export function getMountAltAz(store: Store.Content, currentScope: string, now: number) : undefined|{alt: number, az: number} {
    const geoCoords = getMountGeoCoords(store, currentScope);

    if (!geoCoords) {
        return undefined;
    }
    // FIXME: share with MountStore
    const raDecScope = getMountPos(store, currentScope);
    if (!raDecScope) {
        return undefined;
    }

    const zenithRa = SkyProjection.getLocalSideralTime(now, geoCoords.long);
    const scopeAltAz = SkyProjection.lstRelRaDecToAltAz({relRaDeg: 15 * raDecScope.ra - zenithRa, dec: raDecScope.dec}, geoCoords);

    scopeAltAz.alt = Math.round(scopeAltAz.alt);
    scopeAltAz.az = Math.round(scopeAltAz.az);
    return scopeAltAz;
}

