import * as Store from "./Store";

export type Notification = {
    text: string,
    className: "Warning"|"Invite",
}

export type NotificationStore = {
    [appId: string]: {[notifId: string]: Notification|undefined}
}

export type Content = {
    appNotifications: NotificationStore;
}

export const initialState:Content = {
    appNotifications: {
    }
}

export function adjusters():Array<(state:Store.Content)=>Store.Content> {
    return [];
}
