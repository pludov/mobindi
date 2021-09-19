import * as Store from "./Store";
import * as Actions from "./Actions";
import * as AudioAlerts from "./AudioAlerts";

export type Notification = {
    text: string,
    className: "Warning"|"Invite",
}

export type NotificationStore = {
    byApp: {
        [appId: string]: {[notifId: string]: Notification|undefined}
    }
}

export type WatchConfiguration = {
    active: boolean;
}

export type Content = {
    notifs: NotificationStore;
    watch: WatchConfiguration;
}

export const initialState:Content = {
    notifs: {
        byApp: {
        }
    },

    watch: {
        active: false
    }
}

const UpdateWatchConfiguration: Actions.Handler<{ value: Partial<WatchConfiguration> }>
    = (state, action) => {
        return {
            ...state,
            watch: {
                ...state.watch,
                ...action.value
            }
        };
    };


const actions = {
    UpdateWatchConfiguration,
}

export type NotificationActions = typeof actions;

Actions.register<NotificationActions>(actions);

export function onImport(t:Partial<Content>) {
    delete t.notifs;
}

// Swallow copy of the store. Do not inplace modify childs
export function onExport(t:Partial<Content>) {
    delete t.notifs;
}

function syncAudioAlerts(state : Store.Content) {
    AudioAlerts.setConfiguration(state.watch);
    return state;
}

export function adjusters():Array<(state:Store.Content)=>Store.Content> {
    return [
        syncAudioAlerts
    ];
}

export async function switchWatchActive() {
    const active = !Store.getStore().getState().watch?.active;
    console.log('active is ', active);
    Actions.dispatch<NotificationActions>()("UpdateWatchConfiguration", {
        "value": {
            active
        }
    });
}
