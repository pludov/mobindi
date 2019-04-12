import * as Store from "./Store";
import * as Utils from "./Utils";
import * as NotificationStore from './NotificationStore';

export type MessageStore = {
    lastMessageDisplayed: string|undefined;
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
                            lastMessageDisplayed: current,
                        },
                        appNotifications: {
                            ...state.appNotifications,
                            messages: undefined
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
                            messages: warning
                        }
                    }
                }
            } else {
                return {
                    ...state,
                    messages: {
                        lastMessageDisplayed: undefined,
                    },
                    appNotifications: {
                        ...state.appNotifications,
                        messages: undefined,
                    }
                }
            }
        }
    }
}

export const initialState:Content = {
    messages: {
        lastMessageDisplayed: undefined
    }
}

export function adjusters() {
    return [
        new MessageAppSynchronizer().adjuster()
    ]
};
