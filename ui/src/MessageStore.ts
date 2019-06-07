import * as Store from "./Store";
import * as Utils from "./Utils";
import * as Actions from "./Actions";
import * as NotificationStore from './NotificationStore';
import Worker from 'shared-worker-loader!./BackgroundWorker/Worker';
import { BackofficeStatus } from '@bo/BackOfficeStatus';
import * as MessageStore from './MessageStore';

export type MessageStore = {
    lastMessageDisplayed: string|undefined;
    notificationAuth: boolean|undefined;
}

export type Content = {
    messages: MessageStore;
}


// Add a unread message
class MessageAppSynchronizer {
    currentApp: string|null;
    currentByUid: undefined | Exclude<Store.Content["backend"]["indiManager"], undefined>["messages"]["byUid"];
    constructor() {
        this.currentApp = null;
        this.currentByUid = undefined;
    }

    adjuster() {
        return (state:Store.Content):Store.Content => {
            var newByUid = Utils.noErr(()=>state.backend.indiManager!.messages.byUid, undefined);
            if (state.currentApp === this.currentApp && newByUid === this.currentByUid) {
                return state;
            }
            const prevByUid = this.currentByUid;
            this.currentApp = state.currentApp;
            this.currentByUid = newByUid;

            if (newByUid !== undefined) {

                const uids = Object.keys(newByUid).sort();
                const current = uids.length ? uids[uids.length - 1] : undefined;

                if (state.currentApp === 'messages' || prevByUid === undefined) {
                    return {
                        ...state,
                        messages: {
                            ...state.messages,
                            lastMessageDisplayed: current,
                        },
                        appNotifications: {
                            ...state.appNotifications,
                            messages: {
                                ...state.appNotifications.messages,
                                unread: undefined
                            }
                        },
                    };
                } else {
                    let warning: NotificationStore.Notification|undefined;
                    if (state.messages.lastMessageDisplayed === current) {
                        warning = undefined;
                    } else {
                        // Count unread messages.
                        let previousPos: number;
                        if (state.messages.lastMessageDisplayed !== undefined) {
                            previousPos = uids.indexOf(state.messages.lastMessageDisplayed);
                        } else {
                            previousPos = -1;
                        }
                        warning = {
                            text: "(" + (uids.length - previousPos - 1) + ")",
                            className: "Warning"
                        }
                    }
                    return {
                        ...state,
                        appNotifications:
                        {
                            ...state.appNotifications,
                            messages: {
                                ...state.appNotifications.messages,
                                unread: warning
                            }
                        }
                    }
                }
            } else {
                return {
                    ...state,
                    messages: {
                        ...state.messages,
                        lastMessageDisplayed: undefined,
                    },
                    appNotifications: {
                        ...state.appNotifications,
                        messages: {
                            ...state.appNotifications.messages,
                            unread: undefined,
                        }
                    }
                }
            }
        }
    }
}

function askAuthAdjuster(state:Store.Content):Store.Content {
    const wantedNotification = (state.messages.notificationAuth !== true && state.currentApp !== "messages");

    const currentStatus = state.appNotifications.messages && !!state.appNotifications.messages.auth;
    if (currentStatus == wantedNotification) {
        return state;
    }

    const wantedValue : NotificationStore.Notification|undefined =
            wantedNotification
                ? {
                    text: "\u26A0",
                    className: "Invite",
                }
                : undefined;

    return {
        ...state,
        appNotifications: {
            ...state.appNotifications,
            messages: {
                ...state.appNotifications.messages,
                auth: wantedValue,
            }
        }
    }
}

export const initialState:Content = {
    messages: {
        lastMessageDisplayed: undefined,
        notificationAuth: getMessageAuthValue(),
    }
}

export function adjusters() {
    return [
        new MessageAppSynchronizer().adjuster(),
        askAuthAdjuster,
    ]
};

const UpdateNotificationAuth: Actions.Handler<{ value: boolean|undefined }>
    = (state, action) => {
        if (state.messages.notificationAuth ==  action.value) return state;
        return {
            ...state,
            messages: {
                ...state.messages,
                notificationAuth: action.value
            }
        };
    };


const actions = {
    UpdateNotificationAuth,
}

export type Actions = typeof actions;

Actions.register<Actions>(actions);

let worker: Worker;
try {
    worker = new Worker("background");
    worker.port.start();
    worker.port.postMessage({ a: 1 });
    worker.port.onmessage = function (event) {console.log('worker event', event);};

    worker.port.postMessage({notificationAllowed: !!getMessageAuthValue()});
} catch(e) {
    console.warn("could not setup notification", e);
}

function getMessageAuthValue():undefined|boolean
{
    try {
        const perm = Notification.permission;
        if (perm === "default") {
            return undefined;
        }
        return perm === "granted";
    } catch(e) {
        console.warn("Notification problem", e);
        return undefined;
    }
}

function dispatchAuthUpdate() {
    const value = getMessageAuthValue();
    Actions.dispatch<MessageStore.Actions>()("UpdateNotificationAuth", {value});
    try {
        worker.port.postMessage({notificationAllowed: !!value});
    } catch(e) {
        console.warn("worker problem", e);
    }
}

export async function performMessageAuth() {
    const value = getMessageAuthValue();
    if (value === true) {
        dispatchAuthUpdate();
    } else {
        try {
            await Notification.requestPermission();
        } finally {
            dispatchAuthUpdate();
        }
    }
}
