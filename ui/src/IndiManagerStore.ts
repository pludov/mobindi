import { update } from './shared/Obj';
import * as Actions from "./Actions";
import * as Store from "./Store";

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
                [dev]:{}
            }
        }
    }
}


const actions = {
    switchToDevice,
}

export type Actions = typeof actions;

Actions.register<Actions>(actions);

export const initialState:Content = {
    indiManager: {
        selectedDevice: undefined,
        expandedGroups: {},
    }
}
