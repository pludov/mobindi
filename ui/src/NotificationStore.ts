import * as Store from "./Store";
import * as Utils from "./Utils";

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