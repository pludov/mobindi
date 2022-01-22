import { deepEqual, deepCopy } from './shared/Obj';

import * as Store from "./Store";
import * as Actions from "./Actions";
import * as Utils from "./Utils";

export type Content = {
    panelMemory: {[id: string]: boolean};
    stateMemory: {[id: string]: any};
}

export const initialState:Content = {
    panelMemory: {},
    stateMemory: {},
}

export function onImport(t:Content) {
    if (!t.panelMemory) {
        t.panelMemory = {};
    }
    if (!t.stateMemory) {
        t.stateMemory = {};
    }
}

// Swallow copy of the store. Do not inplace modify childs
export function onExport(t:Content) {
}

const setPanelState: Actions.Handler<{ panelId: string, panelState: boolean }>
    = (state, action) => {
        if ((!!Utils.getOwnProp(state.panelMemory, action.panelId)) === action.panelState) {
            return state;
        }
        
        return {
            ...state,
            panelMemory: {
                ...state.panelMemory,
                [action.panelId]: action.panelState
            }
        };
    };

const setComponentState: Actions.Handler<{ id: string, state: any }>
    = (state, action) => {
        if (deepEqual(Utils.getOwnProp(state.stateMemory, action.id), action.state)) {
            return state;
        }

        if (action.state === undefined) {

            const stateMemory = {...state.stateMemory};
            delete stateMemory[action.id];
            return {
                ...state,
                stateMemory
            };
        } else {
            return {
                ...state,
                stateMemory: {
                    ...state.stateMemory,
                    [action.id]: deepCopy(action.state)
                }
            };
        }
    };


const actions = {
    setPanelState,
    setComponentState,
}

export type GenericUiActions = typeof actions;

Actions.register<GenericUiActions>(actions);

export function getPanelState(state:Store.Content, panelId: string) {
    return !!Utils.getOwnProp(state.panelMemory, panelId);
}

export function initComponentState<T>(key: string, validate: (t:T|undefined)=>T)
{
    const state = Store.getStore().getState();
    const storedState:T|undefined = Utils.getOwnProp(state.stateMemory, key);
    const result = validate(storedState);
    if (result !== storedState) {
        Actions.dispatch<GenericUiActions>()("setComponentState", {
            id: key,
            state: result,
        });
    }
    return result;
}

export function updateComponentState<T>(key: string, t:T) {
    Actions.dispatch<GenericUiActions>()("setComponentState", {
        id: key,
        state: t,
    });
}

export function getComponentState<T>(state : Store.Content, key:string) : T | undefined {
    return Utils.getOwnProp(state.stateMemory, key);
}

export function adjusters() {
    return [
    ]
};