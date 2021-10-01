import uuid from 'node-uuid';
const TraceError = require('trace-error');

import CancellationToken from 'cancellationtoken';
import Log from './Log';
import { ExpressApplication, AppContext } from "./ModuleBase";
import {CameraStatus, CameraDeviceSettings, BackofficeStatus, Sequence, NotificationStatus, NotificationItem} from './shared/BackOfficeStatus';
import JsonProxy, { has } from './shared/JsonProxy';
import { DriverInterface, Vector } from './Indi';
import {Task, createTask} from "./Task.js";
import {timestampToEpoch} from "./Indi";
import {IdGenerator} from "./IdGenerator";
import * as RequestHandler from "./RequestHandler";
import * as BackOfficeAPI from "./shared/BackOfficeAPI";
import ConfigStore from './ConfigStore';

const logger = Log.logger(__filename);

export default class Notification
        implements RequestHandler.APIAppProvider<BackOfficeAPI.NotificationAPI>
{
    appStateManager: JsonProxy<BackofficeStatus>;
    context: AppContext;
    notificationIdGenerator = new IdGenerator();
    readonly currentStatus : NotificationStatus;
    readonly serverUuid: string;
    readonly watchers: {[uid: string]: (b:boolean)=>(void)} = {};
    readonly expires: {[uid: string]:NodeJS.Timeout} = {};

    constructor(app:ExpressApplication, appStateManager:JsonProxy<BackofficeStatus>, context:AppContext, serverUuid: string) {
        this.appStateManager = appStateManager;
        this.appStateManager.getTarget().notification = {
            byuuid: {},
            list: [],
        };
        this.currentStatus = this.appStateManager.getTarget().notification;
        this.context = context;
        this.serverUuid = serverUuid;
    }

    // Early draft...
    doNotify(title: string, type: NotificationItem["type"], buttons: NotificationItem["buttons"]) {
        const uid = this.serverUuid + ":" + this.notificationIdGenerator.next();
        this.currentStatus.byuuid[uid] = {
            time: new Date().getTime(),
            title,
            type,
            buttons,
        }
        this.currentStatus.list.push(uid);
        return uid;
    }

    notify(title: string) {
        this.doNotify(title, "oneshot", null);
    }

    unnotify(uid: string) {
        delete this.currentStatus.byuuid[uid];
        while(true) {
            const id = this.currentStatus.list.indexOf(uid);
            if (id === -1) {
                break;
            }
            this.currentStatus.list.splice(id, 1);
        }
        delete this.watchers[uid];
        if (has(this.expires, uid)) {
            clearTimeout(this.expires[uid]);
            delete this.expires[uid];
        }
    }

    dialog<T>(ct: CancellationToken, title: string, options:Array<{title:string, value:T}>):Promise<T> {
        return new Promise<T>((res, rej)=> {
            let unrej: undefined|{ (): void; (): void; (): void; };

            const uuid = this.doNotify(title, "dialog", options);
            const doUnrej= ()=>{
                if (unrej !== undefined) {
                    unrej();
                    unrej = undefined;
                }
            }

            const done = (result: any)=>{
                doUnrej();
                res(result as T);
            }

            const abort=(reason?:any)=>{
                doUnrej();
                this.unnotify(uuid);
                if (reason instanceof CancellationToken.CancellationError) {
                    rej(reason);
                } else {
                    rej(new CancellationToken.CancellationError(reason));
                }
            }

            this.watchers[uuid] = done;
            unrej = ct.onCancelled(abort);
        });
    }

    public exposedNotification = async(ct: CancellationToken, message:BackOfficeAPI.ExposedNotificationRequest)=>{
        const uid = message.uuid;
        if (has(this.currentStatus.byuuid, uid) && !has(this.expires, uid)) {
            if (this.currentStatus.byuuid[uid].type === "oneshot") {
                this.expires[uid] = setTimeout(()=>this.closeNotification(CancellationToken.CONTINUE, {uuid:uid}), 10000);
            }
        }
    }

    public closeNotification = async(ct: CancellationToken, message:BackOfficeAPI.CloseNotificationRequest)=>{
        const uid = message.uuid;
        if (has(this.currentStatus.byuuid, uid)) {
            const watcher = has(this.watchers, uid) ? this.watchers[uid]: undefined;

            this.unnotify(uid);
            if (watcher) {
                watcher(message.result);
            }
        }
        logger.debug('Remaining notifications', {remainingNotifications: this.currentStatus});
    }

    private message(content: string) {
        // add this to indi logs for now
        this.context.indiManager.addMessage({
            $$: "message",
            $device: "",
            $timestamp: new Date().toISOString().replace(/Z$/, ''),
            $message: content,
        });
    }

    public info(content: string) {
        logger.info('INFO', {content});
        this.message(content);
    }

    public error(content: string, reason?: any) {
        if (reason) {
            logger.info('ERROR', {content}, reason);
            this.message(content + ": " + (reason.msg || reason));
        } else {
            logger.info('ERROR', {content});
            this.message(content);
        }
    }

    getAPI() {
        return {
            closeNotification: this.closeNotification,
            exposedNotification: this.exposedNotification,
        }
    }
}
