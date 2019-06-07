import uuid from 'node-uuid';
const TraceError = require('trace-error');

import CancellationToken from 'cancellationtoken';
import { ExpressApplication, AppContext } from "./ModuleBase";
import {CameraStatus, CameraDeviceSettings, BackofficeStatus, Sequence, NotificationStatus} from './shared/BackOfficeStatus';
import JsonProxy, { has } from './JsonProxy';
import { hasKey, deepCopy } from './Obj';
import { DriverInterface, Vector } from './Indi';
import {Task, createTask} from "./Task.js";
import {timestampToEpoch} from "./Indi";
import {IdGenerator} from "./IdGenerator";
import * as Obj from "./Obj";
import * as RequestHandler from "./RequestHandler";
import * as BackOfficeAPI from "./shared/BackOfficeAPI";
import ConfigStore from './ConfigStore';

export default class Notification
        implements RequestHandler.APIAppProvider<BackOfficeAPI.NotificationAPI>
{
    appStateManager: JsonProxy<BackofficeStatus>;
    context: AppContext;
    notificationIdGenerator = new IdGenerator();
    readonly currentStatus : NotificationStatus;

    constructor(app:ExpressApplication, appStateManager:JsonProxy<BackofficeStatus>, context:AppContext) {
        this.appStateManager = appStateManager;
        this.appStateManager.getTarget().notification = {
            byuuid: {},
            list: [],
        };
        this.currentStatus = this.appStateManager.getTarget().notification;
        this.context = context;
    }

    // Early draft...
    notify(title: string) {
        const uid = this.notificationIdGenerator.next();
        this.currentStatus.byuuid[uid] = {
            time: new Date().getTime(),
            title: title,
        }
        this.currentStatus.list.push(uid);
    }

    public closeNotification = async(ct: CancellationToken, message:BackOfficeAPI.CloseNotificationRequest)=>{
        console.log('Request to close notification: ', JSON.stringify(message));
        const uid = message.uuid;
        if (has(this.currentStatus.byuuid, uid)) {
            delete this.currentStatus.byuuid[uid];
            while(true) {
                const id = this.currentStatus.list.indexOf(uid);
                if (id === -1) {
                    break;
                }
                this.currentStatus.list.splice(id, 1);
            }
        }
        console.log('Remaining notifications: ' + JSON.stringify(this.currentStatus));
    }

    getAPI() {
        return {
            closeNotification: this.closeNotification,
        }
    }
}
