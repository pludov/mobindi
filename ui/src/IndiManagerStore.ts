import * as Actions from "./Actions";
import * as Store from "./Store";
import * as Utils from "./Utils";
import { IndiDevice, IndiVector } from '@bo/BackOfficeStatus';

export type IndiManagerStoreContent = {
    selectedDevice: string|undefined;
    expandedGroups: {[id: string]: {[id:string]:boolean}};
}

export type Content = {
    indiManager: IndiManagerStoreContent
}

const switchToDevice=(state: Store.Content, payload: {dev: string})=>{
    const dev = payload.dev;
    
    if (state.indiManager.selectedDevice === dev) {
        return state;
    }
    
    return {
        ...state,
        indiManager: {
            ...state.indiManager,
            selectedDevice: dev,
            expandedGroups: {
                ...state.indiManager.expandedGroups,
                [dev]:{
                    ...(Utils.has(state.indiManager.expandedGroups || {}, dev) ? state.indiManager.expandedGroups[dev] : {})
                }
            }
        }
    }
}

const setGroupState=(state: Store.Content, payload: {dev:string, group:string, newState:boolean})=>{
    const {dev, group, newState} = payload;
    return {
        ...state,
        indiManager: {
            ...state.indiManager,
            expandedGroups: {
                ...state.indiManager.expandedGroups,
                [dev]:{
                    ...(Utils.has(state.indiManager.expandedGroups, dev) ? state.indiManager.expandedGroups[dev] : {}),
                    [group]: newState
                }
            }
        }
    }
}


const actions = {
    switchToDevice,
    setGroupState,
}

export type IndiManagerActions = typeof actions;

Actions.register<IndiManagerActions>(actions);

export const initialState:Content = {
    indiManager: {
        selectedDevice: undefined,
        expandedGroups: {},
    }
}

export function onImport(t:Content) {
    t.indiManager = t.indiManager || {};
    t.indiManager.selectedDevice = t.indiManager.selectedDevice || undefined;
    t.indiManager.expandedGroups =  t.indiManager.expandedGroups || {};
}

// Swallow copy of the store. Do not inplace modify childs
export function onExport(t:Content) {
}

export function adjusters():Array<(state:Store.Content)=>Store.Content> {
    return [];
}

export function getDeviceList(state: Store.Content): string [] {
    const indiManager = state.backend.indiManager;
    if (indiManager === undefined) {
        return [];
    }
    return Object.keys(indiManager.deviceTree).sort();
}

export function getVectorList(state: Store.Content, deviceId: string) : string[] {
    const device = getDevice(state, deviceId);
    if (device === null) {
        return [];
    }
    console.log('device is ', device);
    return Object.keys(device).sort();
}

export function getVectorTitles(state: Store.Content, deviceId: string) {
    const device = getDevice(state, deviceId);
    const ret:{[id:string]:string} = {};
    if (device === null) {
        return ret;
    }

    for(const id of Object.keys(device)) {
        ret[id] = device[id].$group+" > " + (device[id].$label || id);
    }

    return ret;
}

export function getPropertyList(state: Store.Content, deviceId: string, vectorId: string)
{
    const vector = getVector(state, deviceId, vectorId);
    if (vector === null) {
        return [];
    }
    return vector.childNames;
}

export function getPropertyTitles(state: Store.Content, deviceId: string, vectorId: string)
{
    const ret:{[id:string]:string} = {};
    const vector = getVector(state, deviceId, vectorId);
    if (vector === null) {
        return ret;
    }

    for(const id of Object.keys(vector.childs)) {
        ret[id] = vector.childs[id].$label;
    }

    return ret;
}

export function hasConnectedDevice(state: Store.Content, devName: string):boolean
{
    const cnx = getProperty(state, devName, "CONNECTION", "CONNECT");
    return cnx === 'On';
}

export function getDevice(state: Store.Content, devName: string):IndiDevice|null
{
    const indiManager = state.backend.indiManager;
    if (indiManager === undefined) {
        return null;
    }
    if (!Utils.has(indiManager.deviceTree, devName)) {
        return null;
    }
    return indiManager.deviceTree[devName];
}

export function getVector(state: Store.Content, devName: string, vecName: string):IndiVector|null
{
    const dtree = getDevice(state, devName);
    if (dtree === null) {
        return null;
    }
    if (!Utils.has(dtree, vecName)) {
        return null;
    }
    const connVec = dtree[vecName];
    return connVec;
}

export function getProperty(state: Store.Content, devName: string, vecName: string, propName: string):string|null
{
    const vec = getVector(state, devName, vecName);
    if (vec === null) {
        return null;
    }
    if (!Utils.has(vec.childs, propName)) {
        return null;
    }
    const connectProp = vec.childs[propName];
    return connectProp.$_;
}