import * as Store from "./Store";
import * as Actions from "./Actions";
import * as Utils from "./Utils";

export type Content = {
    panelMemory: {[id: string]: boolean};
}

export const initialState:Content = {
    panelMemory: {}
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


const actions = {
    setPanelState,
}

export type Actions = typeof actions;

Actions.register<Actions>(actions);

export function getPanelState(state:Store.Content, panelId: string) {
    return !!Utils.getOwnProp(state.panelMemory, panelId);
}

export function adjusters() {
    return [
    ]
};