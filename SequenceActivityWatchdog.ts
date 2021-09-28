import CancellationToken from 'cancellationtoken';

import Log from './Log';
import * as AccessPath from './shared/AccessPath';
import { AppContext } from "./ModuleBase";
import { BackofficeStatus, } from './shared/BackOfficeStatus';
import JsonProxy, { SynchronizerTriggerCallback } from './shared/JsonProxy';

const logger = Log.logger(__filename);


export class SequenceActivityWatchdog {
    private readonly appStateManager: JsonProxy<BackofficeStatus>;
    private readonly context: AppContext;
    private readonly uid: string;
    private done: boolean;
    private started: boolean;
    private sequenceTrigger?: SynchronizerTriggerCallback;

    // Clock for 0. When clock reach the limit, a notification is opened
    private t0: number;
    private timer?: NodeJS.Timer;
    private timerTime?: number;
    private notification?: string;

    constructor(appStateManager:JsonProxy<BackofficeStatus>, context: AppContext, uid:string) {
        this.appStateManager = appStateManager;
        this.context = context;
        this.uid = uid;
        this.done = false;
        this.started = false;
        this.t0 = 0;
    }

    private start=()=>{
        this.started = true;
        this.sequenceTrigger = this.appStateManager.addTypedSynchronizer(
            AccessPath.For((e)=>e.sequence.sequences.byuuid[this.uid].activityMonitoring),
            this.doEval,
            false
        )
    }

    private clearTimeout=()=>{
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = undefined;
            this.timerTime = undefined;
        }
    }

    private clearNotification=()=>{
        if (this.notification !== undefined) {
            this.context.notification.unnotify(this.notification);
            this.notification = undefined;
        }
    }

    private doEval = ()=> {
        // Verifiy timing
        // Emit notification
        // replace the timer
        logger.debug("Watchdog check occuring");
        const status = this.appStateManager.getTarget().sequence.sequences.byuuid[this.uid]?.activityMonitoring;
        if (status?.enabled && (status?.duration !== undefined)) {
            const expiration = this.t0 + 1000 * status.duration;
            const now = new Date().getTime();
            logger.debug("Watchdog status", {...status, expiration, now});
            if (now < expiration) {
                this.clearNotification();

                // Only change the timer if new expiration is to be set
                if (this.timer === undefined || this.timerTime !== expiration) {
                    this.clearTimeout();
                    this.timer = setTimeout(()=> {
                        this.timer = undefined;
                        this.timerTime = undefined;
                        this.doEval();
                    }, expiration - now);
                }
            } else {
                logger.warn("Watchdog did expire", {...status, expiration, now});
                // Emit a notification
                if (this.notification === undefined) {
                    const title = `Sequence didn't show activity for the last ${status.duration!} seconds`;
                    this.notification = this.context.notification.doNotify(title, "dialog", [
                        {
                            title: "dismiss",
                            value: true,
                        }
                    ]);
                }
            }
        } else {
            this.clearTimeout();
            this.clearNotification();
        }
    }

    // Start or restart. The the current time (can be negative)
    reset=(startFrom : number)=>{
        logger.debug('Reseting watchdog', {sequenceUid: this.uid, startFrom});
        this.t0 = new Date().getTime() - 1000 * startFrom;
        if (!this.started) {
            this.start();
        }
        this.doEval();
    }

    // Clear the instance. Cannot be reused
    end=()=> {
        if (this.done) {
            return;
        }

        this.clearNotification();
        this.clearTimeout();
        this.done = true;
        if (this.sequenceTrigger) {
            this.appStateManager.removeSynchronizer(this.sequenceTrigger);
        }
        this.sequenceTrigger = undefined;
    }
}