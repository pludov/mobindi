import * as Actions from "./Actions";
import * as Store from "./Store";
import * as Utils from "./Utils";

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
                    ...(Utils.has(state.indiManager.expandedGroups, dev) ? state.indiManager.expandedGroups[dev] : {})
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

export type Actions = typeof actions;

Actions.register<Actions>(actions);

export const initialState:Content = {
    indiManager: {
        selectedDevice: undefined,
        expandedGroups: {},
    }
}

export function adjusters():Array<(state:Store.Content)=>Store.Content> {
    return [];
}

export function hasConnectedDevice(state: Store.Content, devName: string):boolean
{
    const cnx = getProperty(state, devName, "CONNECTION", "CONNECT");
    return cnx === 'On';
}

export function getProperty(state: Store.Content, devName: string, vecName: string, propName: string):string|null
{
    const indiManager = state.backend.indiManager;
    if (indiManager === undefined) {
        return null;
    }
    if (!Utils.has(indiManager.deviceTree, devName)) {
        return null;
    }
    const dtree = indiManager.deviceTree[devName];
    if (!Utils.has(dtree, vecName)) {
        return null;
    }
    const connVec = dtree[vecName];
    if (!Utils.has(connVec.childs, propName)) {
        return null;
    }
    const connectProp = connVec.childs[propName];
    return connectProp.$_;
}