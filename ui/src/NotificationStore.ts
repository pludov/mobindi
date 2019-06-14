import * as Store from "./Store";

export type Notification = {
    text: string,
    className: "Warning"|"Invite",
}

export type NotificationStore = {
    byApp: {
        [appId: string]: {[notifId: string]: Notification|undefined}
    }
}

export type Content = {
    notifs: NotificationStore;
}

export const initialState:Content = {
    notifs: {
        byApp: {
        }
    }
}

export function adjusters():Array<(state:Store.Content)=>Store.Content> {
    return [];
}
