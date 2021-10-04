import CancellationToken from 'cancellationtoken';

import { canonicalize } from 'json-canonicalize';

import Log from './Log';
import * as AccessPath from './shared/AccessPath';
import * as Obj from './shared/Obj';
import { AppContext } from "./ModuleBase";
import { BackofficeStatus, ImageStats, Sequence, SequenceStepParameters, SequenceValueMonitoring, } from './shared/BackOfficeStatus';
import JsonProxy, { SynchronizerTriggerCallback } from './shared/JsonProxy';
import { SequenceLogic } from './shared/SequenceLogic';
import { SequenceParamClassifier } from './shared/SequenceParamClassifier';
import SequenceManager from './SequenceManager';

const logger = Log.logger(__filename);

type KeysMatching<T, V> = {[K in keyof T]-?: T[K] extends V ? K : never}[keyof T];

function getPercentile(e: Array<number|undefined>, p: number):number|null
{
    if (e.length === 0) return null;
    e = e.sort();
    const id = Math.trunc((e.length - 1) * p);
    const v = e[id];
    if (v === undefined) return null;
    return v;
}

export class SequenceStatisticWatcher {
    private readonly appStateManager: JsonProxy<BackofficeStatus>;
    private readonly context: AppContext;
    private readonly uid: string;
    private readonly monitoringKey: KeysMatching<Sequence, SequenceValueMonitoring>;
    private readonly statKey: KeysMatching<ImageStats, number|undefined>;
    private done: boolean;
    private started: boolean;
    private sequenceTrigger?: Array<SynchronizerTriggerCallback>;

    // Clock for 0. When clock reach the limit, a notification is opened
    private notification?: string;
    private notificationJcsId?: string;

    private dismissed: {[id:string] : boolean} = {};

    constructor(appStateManager:JsonProxy<BackofficeStatus>, context: AppContext,
                    uid:string,
                    statKey: KeysMatching<ImageStats, number|undefined>,
                    monitoringKey: KeysMatching<Sequence, SequenceValueMonitoring>) {
        this.appStateManager = appStateManager;
        this.context = context;
        this.statKey = statKey;
        this.monitoringKey = monitoringKey;
        this.uid = uid;
        this.done = false;
        this.started = false;
    }

    public start=()=>{
        this.started = true;
        this.sequenceTrigger = [
            this.appStateManager.addTypedSynchronizer(
                AccessPath.For((e)=>e.sequence.sequences.byuuid[this.uid].root),
                this.doEval,
                false
            ),
            this.appStateManager.addTypedSynchronizer(
                AccessPath.For((e)=>e.sequence.sequences.byuuid[this.uid][this.monitoringKey].enabled),
                this.doEval,
                false
            ),
            this.appStateManager.addTypedSynchronizer(
                AccessPath.For((e)=>e.sequence.sequences.byuuid[this.uid][this.monitoringKey].seuil),
                this.doEval,
                false
            ),
            this.appStateManager.addTypedSynchronizer(
                AccessPath.ForWildcard((e, ids)=>e.sequence.sequences.byuuid[this.uid][this.monitoringKey].perClassSettings[ids[0]]),
                this.doEval,
                false
            )
        ];
        this.doEval();
    }

    private clearNotification=()=>{
        if (this.notification !== undefined) {
            this.context.notification.unnotify(this.notification);
            this.notification = undefined;
            this.notificationJcsId = undefined;
        }
    }

    private doEval = ()=> {
        if (this.done) {
            return;
        }

        // Verifiy timing
        // Emit notification
        // replace the timer
        logger.debug("Watchdog check occuring");
        const sequence = this.appStateManager.getTarget().sequence.sequences.byuuid[this.uid];
        const monitoringSettings: SequenceValueMonitoring = sequence?.[this.monitoringKey];
        if (monitoringSettings?.enabled) {
            const alarm = false;

            logger.debug("Statistic watcher", {statKey: this.statKey, ...monitoringSettings, alarm});

            const sl = new SequenceLogic(sequence, ()=>"");
            const classifier = new SequenceParamClassifier();
            sl.scanParameters(classifier.addParameter);

            type PerClassDynStatus = {
                learningValues: number[];
                evaluationValues: number[];
                lastImageTime?: number;
                alarm?:boolean;
            }
            const perClassDynStatus : {[jcs: string]: PerClassDynStatus } = {};

            const settingJcsIds = classifier.extractParameters().map(canonicalize);

            for(const jcs of settingJcsIds) {
                let classSettings = Obj.getOwnProp(monitoringSettings.perClassSettings, jcs);
                if (classSettings === undefined) {
                    monitoringSettings.perClassSettings[jcs] = {...SequenceLogic.emptyMonitoringClassSettings};
                }

                let classStatus = Obj.getOwnProp(monitoringSettings.perClassStatus, jcs);
                if (classStatus === undefined) {
                    monitoringSettings.perClassStatus[jcs] = {...SequenceLogic.emptyMonitoringClassStatus};
                }

                let dynStatus: PerClassDynStatus|undefined = Obj.getOwnProp(perClassDynStatus, jcs);
                if (dynStatus === undefined) {
                    dynStatus = {
                        learningValues: [],
                        evaluationValues: [],
                    }
                    perClassDynStatus[jcs] = dynStatus;
                }
            }

            for(const imageId of [...sequence.images].reverse()) {
                const imageStat = Obj.getOwnProp(sequence.imageStats, imageId);
                if (imageStat === undefined) {
                    continue;
                }

                const value = imageStat[this.statKey];
                if (value === undefined) {
                    // FIXME We also arrive here if star detection detects 0 star. This is bad obviously and must be reported somehow

                    continue;
                }

                const jcs:string|undefined = classifier.extractJcsIdForParameters(imageStat);

                if (jcs === undefined) {
                    continue;
                }

                const classSettings = Obj.getOwnProp(monitoringSettings.perClassSettings, jcs);
                const classStatus = Obj.getOwnProp(monitoringSettings.perClassStatus, jcs);
                const dynStatus: PerClassDynStatus|undefined = Obj.getOwnProp(perClassDynStatus, jcs);

                if (!(classSettings && classStatus && dynStatus)) {
                    // Should not happen
                    continue;
                }

                // Image can participate to learning
                if (classSettings.learningMinTime === undefined || imageStat.arrivalTime > classSettings.learningMinTime) {
                    // Acceptable for learning. Add to learning Values
                    dynStatus.learningValues.push(value);
                }

                // Image can participate to evaluation
                if (dynStatus.evaluationValues.length < monitoringSettings.evaluationCount
                    && (classSettings.evaluationMinTime === undefined || imageStat.arrivalTime > classSettings.evaluationMinTime)) {
                    dynStatus.evaluationValues.push(value);
                    if (dynStatus.lastImageTime === undefined) {
                        dynStatus.lastImageTime = imageStat.arrivalTime;
                    }
                }
            }

            let alarmJcsIds: Array<string> = [];
            for(const jcs of settingJcsIds) {
                const classSettings = Obj.getOwnProp(monitoringSettings.perClassSettings, jcs)!;
                const classStatus = Obj.getOwnProp(monitoringSettings.perClassStatus, jcs)!;
                const dynStatus: PerClassDynStatus|undefined = Obj.getOwnProp(perClassDynStatus, jcs)!;

                // Compute the learned value
                // Only take the last learningCount
                dynStatus.learningValues = dynStatus.learningValues.slice(-monitoringSettings.learningCount);
                classStatus.learnedCount = dynStatus.learningValues.length;
                classStatus.learningReady = dynStatus.learningValues.length >= monitoringSettings.learningCount;
                classStatus.learnedValue = getPercentile(dynStatus.learningValues, monitoringSettings.learningPercentile);

                classStatus.lastValueTime = dynStatus.lastImageTime === undefined ? null : dynStatus.lastImageTime;
                classStatus.lastValue = dynStatus.evaluationValues.length ? dynStatus.evaluationValues[0] : null;

                classStatus.currentCount = dynStatus.evaluationValues.length;
                if (dynStatus.evaluationValues.length >= monitoringSettings.evaluationCount) {
                    classStatus.currentValue = getPercentile(dynStatus.evaluationValues, monitoringSettings.evaluationPercentile);
                } else {
                    classStatus.currentValue = null;
                }

                if (classSettings.disable) {
                    classStatus.maxAllowedValue = null;
                } else if (classSettings.manualValue !== undefined) {
                    classStatus.maxAllowedValue = classSettings.manualValue + (monitoringSettings.seuil || 0);
                } else {
                    classStatus.maxAllowedValue =
                            (!classStatus.learningReady) || (classStatus.learnedValue  === null)
                                ? null
                                : classStatus.learnedValue + (monitoringSettings.seuil || 0)
                }

                dynStatus.alarm= (classStatus.maxAllowedValue !== null)
                                && (classStatus.currentValue !== null)
                                && (classStatus.currentValue > classStatus.maxAllowedValue);
                if (dynStatus.alarm) {
                    alarmJcsIds.push(jcs);
                }
            }

            logger.debug('Sequence statistic watcher status', {
                    monitoringKey: this.monitoringKey,
                    alarmJcsIds,
                    dismissed: this.dismissed
            })
            // Drop the current notification if not relevant anymore
            if (this.notification && alarmJcsIds.indexOf(this.notificationJcsId!) === -1) {
                this.clearNotification();
            }

            // Acquiese all non valid alarms
            for(const jcs of Object.keys(this.dismissed)) {
                if (alarmJcsIds.indexOf(jcs) === -1) {
                    logger.debug("Dismissed", {jcs});
                    delete this.dismissed[jcs];
                }
            }

            const nonDismissedJcsIds = alarmJcsIds.filter((k)=>!Obj.hasKey(this.dismissed, k));
            if (nonDismissedJcsIds.length && !this.notification) {
                const alarmJcsId = nonDismissedJcsIds[0];
                logger.info("Emitting notification", {
                    monitoringKey: this.monitoringKey,
                    alarmJcsId,
                });

                // Emit a notification
                const title = `Sequence statistics are wrong for ${alarmJcsId}`;
                this.notification = this.context.notification.doNotify(title, "dialog", [
                    {
                        title: "dismiss",
                        value: true,
                    }
                ]);
                this.notificationJcsId = alarmJcsId;
                this.context.notification.onNotificationResult(this.notification, (c: any)=> {
                    logger.info("Dismissed notification", {
                        monitoringKey: this.monitoringKey,
                        alarmJcsId,
                    });
                    this.dismissed[alarmJcsId] = true;
                    this.notification = undefined;
                    this.notificationJcsId = undefined;
                    this.doEval();
                });
            }
        } else {
            this.clearNotification();
            this.dismissed = {};
        }
    }

    // Called when the sequence receive a new image
    updateStats = ()=> {
        this.doEval();
    }

    // Clear the instance. Cannot be reused
    end=()=> {
        if (this.done) {
            return;
        }
        this.done = true;

        this.clearNotification();
        if (this.sequenceTrigger) {
            for(const trigger of this.sequenceTrigger) {
                this.appStateManager.removeSynchronizer(trigger);
            }
        }
        this.sequenceTrigger = undefined;
    }
};
