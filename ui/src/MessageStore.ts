import Log from './shared/Log';
import * as Store from "./Store";
import * as Utils from "./Utils";
import * as Actions from "./Actions";
import * as NotificationStore from './NotificationStore';
import { BackofficeStatus } from '@bo/BackOfficeStatus';

const logger = Log.logger(__filename);

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
            var newByUid = state.backend.indiManager?.messages.byUid;
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
                        notifs: {
                            ...state.notifs,
                            byApp: {
                                ...state.notifs.byApp,
                                messages: {
                                    ...state.notifs.byApp.messages,
                                    unread: undefined
                                }
                            },
                        }
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
                        notifs: {
                            ...state.notifs,
                            byApp: {
                                ...state.notifs.byApp,
                                messages: {
                                    ...state.notifs.byApp.messages,
                                    unread: warning
                                }
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
                    notifs: {
                        ...state.notifs,
                        byApp: {
                            ...state.notifs.byApp,
                            messages: {
                                ...state.notifs.byApp.messages,
                                unread: undefined,
                            }
                        }
                    }
                }
            }
        }
    }
}

function askAuthAdjuster(state:Store.Content):Store.Content {
    const wantedNotification = (state.messages.notificationAuth !== true && state.currentApp !== "messages");

    const currentStatus = state.notifs.byApp.messages && !!state.notifs.byApp.messages.auth;
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
        notifs: {
            ...state.notifs,
            byApp: {
                ...state.notifs.byApp,
                messages: {
                    ...state.notifs.byApp.messages,
                    auth: wantedValue,
                }
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

export function onImport(t:Partial<Content>) {
    delete t.messages;
}

// Swallow copy of the store. Do not inplace modify childs
export function onExport(t:Partial<Content>) {
    delete t.messages;
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

export type MessageActions = typeof actions;

Actions.register<MessageActions>(actions);

let worker: SharedWorker;
if (typeof(SharedWorker) !== 'undefined') {
    try {
        worker = new SharedWorker(new URL('BackgroundWorker/Worker.ts', import.meta.url));
        worker.port.start();
        worker.port.postMessage({ a: 1 });
        worker.port.onmessage = function (event) {logger.debug('worker event', {event});};

        worker.port.postMessage({notificationAllowed: !!getMessageAuthValue()});

        window.addEventListener("unload", ()=> {
            worker.port.postMessage({unloaded: true});
        });

        let hidden: string;
        let visibilityChange: string;
        if (typeof document.hidden !== "undefined") { // Opera 12.10 and Firefox 18 and later support
            hidden = "hidden";
            visibilityChange = "visibilitychange";
        } else if (typeof (document as any).msHidden !== "undefined") {
            hidden = "msHidden";
            visibilityChange = "msvisibilitychange";
        } else if (typeof (document as any).webkitHidden !== "undefined") {
            hidden = "webkitHidden";
            visibilityChange = "webkitvisibilitychange";
        } else {
            logger.warn('no access to visiblity status');
            hidden = "";
            visibilityChange = "";
        }

        if (visibilityChange && hidden) {
            let timer:NodeJS.Timer;
            const ping = ()=> {
                logger.debug('worker ping');
                const visible = !document[hidden];

                worker.port.postMessage({visible});
            };

            document.addEventListener(visibilityChange, ()=>{
                ping();
                clearInterval(timer);
                timer = setInterval(ping, 30000);
            }, false);
            timer = setInterval(ping, 30000);
            ping();
        }

    } catch(e) {
        logger.error("could not setup notification", e);
    }
}

function getMessageAuthValue():undefined|boolean
{
    try {
        if (typeof(Notification) === 'undefined') {
            logger.info('Notification not supported');
            return undefined;
        }
        const perm = Notification.permission;
        if (perm === "default") {
            return undefined;
        }
        return perm === "granted";
    } catch(e) {
        logger.error("Notification problem", e);
        return undefined;
    }
}

function dispatchAuthUpdate() {
    const value = getMessageAuthValue();
    Actions.dispatch<MessageActions>()("UpdateNotificationAuth", {value});
    try {
        worker.port.postMessage({notificationAllowed: !!value});
    } catch(e) {
        logger.error("worker problem", e);
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
