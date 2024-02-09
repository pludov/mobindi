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

import Log from '../shared/Log';
import Notifier from "../Notifier";
import { BackendStatusValue, BackendStatus } from '../BackendStore';
import { BackofficeStatus } from '@bo/BackOfficeStatus';
import JsonProxy, { has } from '../shared/JsonProxy';

const logger = Log.logger(__filename);

interface SharedWorkerGlobalScope extends Worker {
    onconnect: (event: MessageEvent) => void;
}

declare var self:SharedWorkerGlobalScope;
// Compatibility with Websocket (that uses window.setTimeout, ...)
(self as any).window = self;


let notifier: WorkerNotifier;


let notificationAllowed: boolean = false;
let boCnx: BackendStatusValue;
let boCnxError: string|undefined;
let boStatus: {notification: BackofficeStatus["notification"]} | undefined;


let visibleClientCount:number = 0;

class WorkerNotifier extends Notifier {
    protected onStatusChanged(backendStatus: BackendStatusValue, backendError?: string) {
        logger.debug('worker got new status',  {backendStatus, backendError});
        boCnx = backendStatus;
        boCnxError = backendError;
        if (backendStatus != BackendStatus.Connected || backendError != null) {
            boStatus = undefined;
        }
        emitNotifications();
    }

    protected handleNotifications(n: {batch: any[]}|{data: any}) {
        logger.debug('worker notified');
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

let shownNotifications: {[id:string]:true|number} = {};
let visibleNotifications: {[id:string]:Notification} = {};

function exposedNotification(uuid: string)
{
    notifier.sendRequest({
        _app: 'notification',
        _func: 'exposedNotification',
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
            const v = shownNotifications[uuid] ;
            // if ((v !== true) && v + 30000 < now) {
            //     shownNotifications[uuid] = now;
            //     if (boStatus.notification.byuuid[uuid].type === "oneshot") {
            //         exposedNotification(uuid);
            //     }
            // }
            continue;
        }
        shownNotifications[uuid] = true;

        const notif = boStatus.notification.byuuid[uuid];

        if (visibleClientCount === 0 && !has(visibleNotifications, uuid)) {
            shownNotifications[uuid] = now;
            const n = new Notification(notif.title, {

            });
            if (notif.type === "dialog") {
                visibleNotifications[uuid] = n;
            }
            // if (notif.type === "oneshot") {
            //     exposedNotification(uuid);
            // }
        }
    }
    for(const uuid of Object.keys(visibleNotifications)) {
        if (!has(boStatus.notification.byuuid, uuid)) {
            const toKill = visibleNotifications[uuid];
            delete visibleNotifications[uuid];
            setTimeout(()=> {toKill.close()}, 5000);
        }
    }
    return result;
}


let disconnectTime: undefined|number;
let disconnectTimer: NodeJS.Timer|undefined;
let disconnectedNotification: Notification|undefined;

function emitNotifications() {
    logger.debug('notificationAllowed', {notificationAllowed});
    const now = new Date().getTime();
    if (!notificationAllowed) {
        if (boStatus !== undefined) {
            for(const o of boStatus.notification.list) {
                if (!has(shownNotifications, o)) {
                    shownNotifications[o] = now;
                }
            }
        }
        return;
    }

    if (boCnx !== BackendStatus.Connected) {
        if (disconnectTimer === undefined) {
            disconnectTimer = setInterval(emitNotifications, 5000);
        }
        if (disconnectTime === undefined) {
            disconnectTime = now;
        } else {
            if (disconnectedNotification === undefined && now - disconnectTime > 30000) {
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

type ClientStatus = {
    alive: boolean;
    visible: boolean;
}

try {
    setInterval(()=> {
        logger.debug('worker alive');
    }, 60000);

    self.onconnect = function(e) {
        logger.info('worker got connection', e);
        try {
            var port = e.ports[0];
            let expireTimeout: NodeJS.Timeout|undefined = undefined;
            let status: ClientStatus = {
                alive: false,
                visible: false,
            }

            const expire = ()=> {
                expireTimeout = undefined;
                updateStatus({alive: false});
            }

            const transStatus=(prev: ClientStatus, cur: ClientStatus)=>{
                if ((prev.alive && prev.visible) != (cur.alive && cur.visible)) {
                    visibleClientCount += (cur.alive && cur.visible) ? 1 : -1;
                    logger.debug('Visible client count ', {visibleClientCount});
                }
                // clear interval
                if (expireTimeout !== undefined) {
                    clearTimeout(expireTimeout);
                    expireTimeout = undefined;
                }

                if (cur.alive) {
                    expireTimeout = setTimeout(expire, 60000);
                }
            }

            const updateStatus=(nvStatus: Partial<ClientStatus>)=>{
                let newStatus = {...status, ...nvStatus};
                const oldStatus = status;
                status = newStatus;
                transStatus(oldStatus, status);
            }

            updateStatus({
                alive: true,
                visible: true,
            });

            port.onmessage = function(evt:any) {
                try {
                    logger.debug('worker got evt', {data: evt.data});
                    if (has(evt.data, "notificationAllowed")) {
                        notificationAllowed = evt.data.notificationAllowed;
                        emitNotifications();
                    }
                    if (has(evt.data, "unloaded")) {
                        updateStatus({
                            alive: false
                        });
                        return;
                    }
                    if (has(evt.data, "visible")) {
                        updateStatus({
                            visible: evt.data.visible
                        });
                    }
                    updateStatus({
                        alive: true
                    });
                } catch(e) {
                    logger.error('error from worker onmessage', e);
                }
            }
            
            port.postMessage({
                workerLocation: "" + (self as any).location,
            });

            
        } catch(e) {
            logger.error('error from worker onconnect', e);
        }
    }
    const location = (self as any).location;
    notifier = new WorkerNotifier({notification: true});
    notifier.connect(location.protocol + '//' + location.hostname  + ':' + location.port + '/');

} catch(e) {
    logger.error('error from worker', e);
}



