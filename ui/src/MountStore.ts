import { getVector } from './IndiStore';
import { parsePropFloat } from './IndiUtils';
import SkyProjection, { Map360 } from './SkyAlgorithms/SkyProjection';
import * as Store from './Store';
 
// Position are in hours and degrees
type JNOWPosition = {
    ra: number;
    dec: number;
}

export type MountGeography = {
    latitude: number;
    longitude: number;
}


export type MountRichPos = {
    ra_jnow: number;
    dec_jnow: number;
    // Hour angle (apparent)
    ha_jnow: number;
    pier_side: "west"|"east";
    ra_j2000: number;
    dec_j2000: number;
    latitude: number;
    longitude: number;
};

function getMountGeographyFromStore(store:Store.Content, currentScope: string) : MountGeography|undefined {
    let vector_geographic = getVector(store, currentScope, "GEOGRAPHIC_COORD");

    const latitude = parsePropFloat(vector_geographic?.childs["LAT"]?.$_);
    const longitude = parsePropFloat(vector_geographic?.childs["LONG"]?.$_);
    
    if (latitude === undefined || longitude === undefined) {
        return undefined;
    }
    return {
        latitude,
        longitude
    };

}

// Return the mount position from the store in JNOW degrees, or undefined if not available
export function getMountPosFromStore(store: Store.Content, currentScope: string): JNOWPosition|undefined {
    let vector_position = getVector(store, currentScope, "EQUATORIAL_EOD_COORD");

    const ra_jnow = parsePropFloat(vector_position?.childs["RA"]?.$_);
    const dec_jnow = parsePropFloat(vector_position?.childs["DEC"]?.$_);

    if (ra_jnow === undefined || dec_jnow === undefined) {
        return undefined;
    }
    return {
        ra: ra_jnow * 15, // Convert to degrees
        dec: dec_jnow
    };
}

// epoch is system time is milliseconds
export function getMountRichPosFromStore(store:Store.Content, currentScope: string, epoch: number) : Partial<MountRichPos> {
    let geography = getMountGeographyFromStore(store, currentScope);

    const jnow = getMountPosFromStore(store, currentScope);

    let ah_jnow: number|undefined = undefined;
    // Compute the apparent hour angle
    if (geography && jnow) {
        const zenithRa = SkyProjection.getLocalSideralTime(epoch, geography?.longitude);

        ah_jnow = Map360(zenithRa - jnow.ra);
    }

    // Convert to J2000
    const [ ra_j2000, dec_j2000 ] =
        jnow ? SkyProjection.J2000RaDecFromEpoch([jnow.ra, jnow.dec], epoch)
            : [undefined, undefined];


    return {
        ra_jnow : jnow?.ra,
        dec_jnow : jnow?.dec,
        ha_jnow: ah_jnow,
        ...geography,
        ra_j2000,
        dec_j2000,
    };
}