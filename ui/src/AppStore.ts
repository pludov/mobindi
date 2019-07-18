import { BackofficeStatus } from '@bo/BackOfficeStatus';
import * as Store from "./Store";
import * as Actions from "./Actions";
import * as JsonProxy from './shared/JsonProxy';
import { BackendStatus } from './BackendStore';

export type Content = {
    currentApp: string|null;
}

export const initialState:Content = {
    currentApp: null
}

export function onImport(t:Content) {
    t.currentApp = t.currentApp || null;
}

// Swallow copy of the store. Do not inplace modify childs
export function onExport(t:Content) {
}

const SwitchToApp: Actions.Handler<{ value: string }>
    = (state, action) => {
        console.log('SwitchToApp', action);
        var appid = action.value;
        if (state.currentApp == appid) return state;
        return {
            ...state,
            currentApp: appid
        };
    };


const actions = {
    SwitchToApp,
}

export type Actions = typeof actions;

Actions.register<Actions>(actions);

function adjustInvalidApp(state:Store.Content) {
    // Assurer que l'app en cours est toujours autorisée
    if (state.backendStatus === BackendStatus.Connected &&
        state.currentApp !== null &&
        state.backend.apps
        && (!(state.currentApp in state.backend.apps)
                || !state.backend.apps[state.currentApp].enabled))
    {
        // FIXME: take the first ?
        state = {...state, currentApp: null};
    }
    return state;
}

function adjustChooseValidApp(state:Store.Content) {
    // Assurer qu'on ait une app en cours si possible
    if (state.backendStatus === BackendStatus.Connected &&
        state.currentApp === null && state.backend.apps && Object.keys(state.backend.apps).length !== 0) {

        // On prend la premiere... (FIXME: historique & co...)
        var bestApp = null;
        var bestKey = null;
        for (var key in state.backend.apps) {
            var app = state.backend.apps[key];
            if (bestApp == null
                || (bestApp.position > app.position)
                || (bestApp.position == app.position && bestKey! < key)) {
                bestApp = app;
                bestKey = key;
            }
        }
        state = {...state, currentApp: bestKey};
    }
    return state;
}

export function adjusters() {
    return [
        adjustInvalidApp,
        adjustChooseValidApp,
    ]
};