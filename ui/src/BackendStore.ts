import { BackofficeStatus } from '@bo/BackOfficeStatus';
import * as Actions from "./Actions";
import * as Store from "./Store";
import * as JsonProxy from './shared/JsonProxy';
import { time } from 'console';

export type Content = {
    backendStatus: number;
    backendLastCnxTime: number|null;
    appStartTime: number;
    backendError: string|null;
    // FIXME: switch that to nullable
    backend: Partial<BackofficeStatus>;
}

export const initialState:Content = {
    backendStatus: 0,
    backendError: null,
    backendLastCnxTime: null,
    appStartTime: new Date().getTime(),
    backend: {
        apps: {}
    },
}

export function onImport(t:Partial<Content>) {
    delete t.backend;
    delete t.backendStatus;
    delete t.backendError;
    delete t.appStartTime;
}

// Swallow copy of the store. Do not inplace modify childs
export function onExport(t:Partial<Content>) {
    delete t.backend;
    delete t.backendStatus;
    delete t.backendError;
    delete t.appStartTime;
}

export type BackendStatusValue = 0 | 1 | 2 | 3 | 4 | 5;

export const BackendStatus : {[Id:string]: BackendStatusValue} = {
    Idle: 0,
    Connecting: 1,
    Connected: 2,
    Paused: 3,
    Reconnecting: 4,        // Après la pause
    Failed: 5
}

const backendStatus: Actions.Handler<{ backendStatus: number, backendError?: string, time: number, data?: BackofficeStatus }>
    = (state, action) => {
        state = Object.assign({}, state);
        if (action.backendStatus === BackendStatus.Connected &&
            state.backendStatus !== BackendStatus.Connected) {
            state.backendLastCnxTime = action.time;
        }
        if (action.backendStatus !== BackendStatus.Connected &&
            state.backendStatus === BackendStatus.Connected) {
            // REcord the time also in case of disconnection
            state.backendLastCnxTime = action.time;
        }
        state.backendStatus = action.backendStatus;
        if (Object.prototype.hasOwnProperty.call(action, "backendError")) {
            state.backendError = action.backendError || null;
        }
        switch (state.backendStatus) {
            case BackendStatus.Connected:
                state.backend = action.data!;
                break;
            case BackendStatus.Paused:
            case BackendStatus.Reconnecting:
                break;
            default:
                state.backend = {};
        }
        return state;
    };

const notification : Actions.Handler<{data?:BackofficeStatus, time: number, diff?: JsonProxy.Diff, batch? : JsonProxy.Diff[]}>
    = (state, action) => {
        // Mettre le status du backend
        state = Object.assign({}, state);
        if (state.backendStatus != BackendStatus.Connected || state.backendError != null) {
            state.backendStatus = BackendStatus.Connected;
            state.backendError = null;
            state.backend = {};
            state.backendLastCnxTime = action.time;
        }
        if (action.data !== undefined) {
            state.backend = action.data;
        } else if (action.diff !== undefined) {
            state.backend = JsonProxy.default.applyDiff(state.backend, action.diff);
        } else if (action.batch !== undefined) {
            for(const diff of action.batch) {
                state.backend = JsonProxy.default.applyDiff(state.backend, diff);
            }
        }
        return state;
    }

const actions = {
    backendStatus,
    notification
}

export type BackendActions = typeof actions;

Actions.register<BackendActions>(actions);


export function adjusters():Array<(state:Store.Content)=>Store.Content> {
    return [];
}
