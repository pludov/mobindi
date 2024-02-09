import Log from './shared/Log';
import * as Actions from "./Actions";
import * as Store from "./Store";

const logger = Log.logger(__filename);

export type GeolocStoreContent = {
    acquired: boolean;
    altitude: number|null;
    latitude: number|null;
    longitude: number|null;
}

export type Content = {
    geoloc: GeolocStoreContent;
}


let geolocWorker : undefined | Promise<GeolocationPosition> = undefined;
let geoloc: GeolocationPosition|undefined = undefined;

function getGeolocWorker() {
    if (!geolocWorker) {
        geolocWorker = new Promise((resolve, reject) => {
            logger.info("Acquiring geo position");
            navigator.geolocation.getCurrentPosition(
                (position)=>{
                    logger.info('got geoloc', {position});
                    geoloc = position;
                    Actions.dispatch<GeolocActions>()("updateGeoloc", {
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        altitude: position.coords.altitude,
                    });
                    geolocWorker = undefined;
                    resolve(position)
                },
                (e)=> {
                    logger.info('geoloc error', e);
                    geolocWorker = undefined;
                    reject(e)
                },
                {enableHighAccuracy: true});
        });
    }
    return geolocWorker;
}

export async function getGeoloc():Promise<GeolocationPosition> {
    return await getGeolocWorker();
}

export function currentGeoloc(state: Store.Content):GeolocStoreContent {
    return state.geoloc;
}

const updateGeoloc=(state: Store.Content, payload: {latitude:number|null, longitude: number|null, altitude: number|null})=>{
    if (state.geoloc.acquired
        && state.geoloc.altitude == payload.altitude
        && state.geoloc.longitude == payload.longitude
        && state.geoloc.latitude == payload.latitude)
    {
        return state;
    }
    return {
        ...state,
        geoloc: {
            ...state.geoloc,
            acquired: true,
            latitude: payload.latitude,
            longitude: payload.longitude,
            altitude: payload.altitude,
        }
    };
}

const actions = {
    updateGeoloc
}

export type GeolocActions = typeof actions;

Actions.register<GeolocActions>(actions);

export const initialState:Content = {
    geoloc: {
        acquired: false,
        altitude: null,
        latitude: null,
        longitude: null,
    }
}

export function onImport(t:Partial<Content>) {
    delete t.geoloc;
}

// Swallow copy of the store. Do not inplace modify childs
export function onExport(t:Partial<Content>) {
    delete t.geoloc;
}

export function adjusters():Array<(state:Store.Content)=>Store.Content> {
    return [];
}
