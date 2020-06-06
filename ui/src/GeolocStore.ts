import * as Actions from "./Actions";
import * as Store from "./Store";

export type GeolocStoreContent = {
    acquired: boolean;
    altitude: number|null;
    latitude: number|null;
    longitude: number|null;
}

export type Content = {
    geoloc: GeolocStoreContent;
}


let geolocWorker : undefined | Promise<Position> = undefined;
let geoloc: Position|undefined = undefined;

function getGeolocWorker() {
    if (!geolocWorker) {
        geolocWorker = new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
                (position)=>{
                    console.log('got geoloc', position);
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
                    geolocWorker = undefined;
                    reject(e)
                },
                {enableHighAccuracy: true});
        });
    }
    return geolocWorker;
}

export async function getGeoloc():Promise<Position> {
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

export function onImport(t:Content) {
    delete t.geoloc;
}

// Swallow copy of the store. Do not inplace modify childs
export function onExport(t:Content) {
    delete t.geoloc;
}

export function adjusters():Array<(state:Store.Content)=>Store.Content> {
    return [];
}
