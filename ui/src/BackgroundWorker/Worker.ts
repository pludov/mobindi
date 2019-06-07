//
// The shared worker will:
//    claim all clients
//    receive notification from backend (so it must be a ws client as well)
//       notifications are:
//             - sequence ends
//             - sequence errors
//             - system reboot (special one, display only the second since installation of the SW)
//             - phd lock, disconnect, ... during sequence (indirect, should be sequence errors)
//       notifications are not displayed when a client is focused ATM
//       notifications are displayed when they are not ack within n seconds
//    dispatch them to website
//    account the number of connected website
//    track the notification authorization status from connected website
//
// notifications lives in the status structure (as a new module)
//    client can ack notification
//

import Notifier from "../Notifier";
import { BackendStatusValue, BackendStatus } from '@src/BackendStore';
import { BackofficeStatus } from '@bo/BackOfficeStatus';
import JsonProxy, { has } from '@src/shared/JsonProxy';

declare var self:SharedWorker.SharedWorkerGlobalScope;
// Compatibility with Websocket (that uses window.setTimeout, ...)
(self as any).window = self;


let notifier: WorkerNotifier;


let notificationAllowed: boolean = false;
let boCnx: BackendStatusValue;
let boCnxError: string|undefined;
let boStatus: {notification: BackofficeStatus["notification"]} | undefined;


class WorkerNotifier extends Notifier {
    protected onStatusChanged(backendStatus: BackendStatusValue, backendError?: string) {
        console.log('worker got new status',  backendStatus);
        boCnx = backendStatus;
        boCnxError = backendError;
        if (backendStatus != BackendStatus.Connected || backendError != null) {
            boStatus = undefined;
        }
        emitNotifications();
    }

    protected handleNotifications(n: {batch: any[]}|{data: any}) {
        console.log('worker notified');
        boCnx = BackendStatus.Connected;
        boCnxError = undefined;

        if (has(n, "data")) {
            boStatus = (n as any).data;
        } else {
            for(const patch of (n as any).batch) {
                boStatus = JsonProxy.applyDiff(boStatus, patch);
            }
        }
        emitNotifications();
    }
}

let shownNotifications: {[id:string]:number} = {};

function discardNotification(uuid: string)
{
    notifier.sendRequest({
        _app: 'notification',
        _func: 'closeNotification',
        payload: {
            uuid
        }
    }, "api");

}

function buildNotificationsFromBackend() {
    if (boStatus === undefined) {
        return [];
    }

    if (boStatus.notification.list.length === 0) {
        return [];
    }
    // On retourne la premiere non présentée
    const now = new Date().getTime();
    const result: Array<{title: string}> = [];
    for(const uuid of boStatus.notification.list) {
        if (has(shownNotifications, uuid)) {
            if (shownNotifications[uuid] + 30000 < now) {
                shownNotifications[uuid] = now;
                discardNotification(uuid);
            }
            continue;
        }
        shownNotifications[uuid] = now;

        const notif = boStatus.notification.byuuid[uuid];

        new Notification(notif.title, {

        });
        discardNotification(uuid);
    }
    return result;
}


let disconnectTime: undefined|number;
let disconnectTimer: NodeJS.Timer|undefined;
let disconnectedNotification: Notification|undefined;

let backendNotif : Notification|undefined;

function emitNotifications() {
    console.log('notificationAllowed', notificationAllowed);
    if (!notificationAllowed) {
        return;
    }
    const now = new Date().getTime();

    if (boCnx !== BackendStatus.Connected) {
        if (disconnectTimer === undefined) {
            disconnectTimer = setInterval(emitNotifications, 1000);
        }
        if (disconnectTime === undefined) {
            disconnectTime = now;
        } else {
            if (disconnectedNotification === undefined && now - disconnectTime > 10000) {
                disconnectedNotification = new Notification("Mobindi connection lost", {
                    requireInteraction: true,
                });
            }
        }
    } else {
        disconnectTime = undefined;
        if (disconnectTimer !== undefined) {
            clearInterval(disconnectTimer);
            disconnectTimer = undefined;
        }
        if (disconnectedNotification !== undefined) {
            disconnectedNotification.close();
            disconnectedNotification = undefined;
        }
    }

    if (disconnectedNotification === undefined) {
        buildNotificationsFromBackend();
    }
}

try {
    setInterval(()=> {
        console.log('Worker alive');
    }, 10000);

    self.onconnect = function(e) {
        console.log('worker got connection', e);
        try {
            var port = e.ports[0];
            
            port.onmessage = function(evt:any) {
                try {
                    console.log('worker got evt', evt);
                    if (has(evt.data, "notificationAllowed")) {
                        notificationAllowed = evt.data.notificationAllowed;
                        emitNotifications();
                    }

                    // var workerResult = 'Result: ' + (e.data[0] * e.data[1]);
                    // port.postMessage(workerResult);
                    // console.log('terminating');
                    // (self as any).close();
                    // console.log('still here ?');
                } catch(e) {
                    console.log('error from worker onmessage', e);
                }
            }
            
            port.postMessage({
                workerLocation: "" + (self as any).location,
            });

            
        } catch(e) {
            console.log('error from worker onconnect', e);
        }
    }
    const location = (self as any).location;
    notifier = new WorkerNotifier({notification: true});
    notifier.connect(location.protocol + '//' + location.hostname  + ':' + location.port + '/');

} catch(e) {
    console.log('error from worker', e);
}



