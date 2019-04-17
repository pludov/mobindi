import * as Store from "./Store";

export type Notification = {
    text: string,
    className: "Warning",
}

export type NotificationStore = {
    [appId: string]: undefined|Notification
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
