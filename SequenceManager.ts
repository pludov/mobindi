import {v4 as uuidv4} from 'node-uuid';
const TraceError = require('trace-error');

import CancellationToken from 'cancellationtoken';
import * as jsonpatch from 'json-patch';
import Log from './Log';
import Sleep from './Sleep';
import { ExpressApplication, AppContext } from "./ModuleBase";
import { CameraDeviceSettings, BackofficeStatus, SequenceStatus, Sequence, SequenceStep, SequenceStepStatus, SequenceStepParameters, PhdGuideStep, PhdGuideStats, ImageStats, ImageStatus, SequenceValueMonitoring, SequenceValueMonitoringPerClassSettings, SequenceValueMonitoringPerClassStatus} from './shared/BackOfficeStatus';
import JsonProxy from './shared/JsonProxy';
import * as Algebra from './Algebra';
import { hasKey, deepCopy } from './shared/Obj';
import {Task, createTask} from "./Task.js";
import * as GuideStats from "./GuideStats";
import {IdGenerator} from "./IdGenerator";
import * as Obj from "./shared/Obj";
import * as Metrics from "./Metrics";
import * as RequestHandler from "./RequestHandler";
import * as BackOfficeAPI from "./shared/BackOfficeAPI";
import ConfigStore from './ConfigStore';
import { SequenceLogic, Progress } from './shared/SequenceLogic';
import { SequenceActivityWatchdog } from './SequenceActivityWatchdog';
import { SequenceStatisticWatcher } from './SequenceStatisticWatcher';
import { SequenceParamClassifier } from './shared/SequenceParamClassifier';

const logger = Log.logger(__filename);

// export type SequenceStepDefinition = {
//     uuid: string;
//     repeat?: number;
//     dither?: boolean;
//     filter?: string|null;
//     bin?: number;
//     exposure?: number;
//     iso?: null|string;
//     frameType?: string;

//     childs?: SequenceStepDefinition[];
// }


type ScopeState = "light"|"dark"|"flat";
const stateByFrameType :{[id:string]:ScopeState}= {
    FRAME_BIAS:"dark",
    FRAME_DARK:"dark",
    FRAME_FLAT:"flat",
}
const coverMessageByFrameType = {
    "light":"Uncover scope",
    "dark": "Cover scope",
    "flat": "Switch scope to flat field",
}

export default class SequenceManager
        implements RequestHandler.APIAppProvider<BackOfficeAPI.SequenceAPI>
{
    readonly appStateManager: JsonProxy<BackofficeStatus>;
    readonly context: AppContext;
    readonly currentStatus: SequenceStatus;
    currentSequenceUuid:string|null = null;
    currentSequencePromise:Task<void>|null = null;
    currentSequenceProgress:Progress|null = null;

    sequenceIdGenerator: IdGenerator;
    lastFwhm: number|undefined;
    lastStarCount: number|undefined;
    lastImageTime: number = 0;
    lastGuideStats: PhdGuideStats|undefined;
    lastBackgroundLevel: number|undefined;
    get indiManager() { return this.context.indiManager };
    get imagingSetupManager() { return this.context.imagingSetupManager };
    get imageProcessor() { return this.context.imageProcessor };
    get phd() { return this.context.phd };
    constructor(app:ExpressApplication, appStateManager:JsonProxy<BackofficeStatus>, context:AppContext) {
        this.appStateManager = appStateManager;
        this.appStateManager.getTarget().sequence = {
            sequences: {
                list: [],
                byuuid: {
                    // Objects with:
                    //   status: 'idle',
                    //   title: 'New sequence',
                    //   camera: null,
                    //   steps: {
                    //     list: [firstSeq],
                    //     byuuid: {
                    //         [firstSeq]: {
                    //             count:  1,
                    //             type:   'FRAME_LIGHT'
                    //         }
                    //     }
                    //
                }
            }
        }
        this.currentStatus = this.appStateManager.getTarget().sequence;
        this.context = context;
        this.sequenceIdGenerator = new IdGenerator();

        new ConfigStore(appStateManager, 'sequences', ['sequence', 'sequences'],
            {
                list: [],
                byuuid: {}
            },{
                list: [],
                byuuid: {}
            },
            // read callback
            (input:Partial<SequenceStatus["sequences"]>)=> {
                const content : SequenceStatus["sequences"] = {list: [], byuuid: {}, ...input};
                // Renumber sequences
                this.sequenceIdGenerator.renumber(content.list, content.byuuid);

                for(const sid of Object.keys(content.byuuid)) {
                    const seq = this.completeSequence(content.byuuid[sid]);
                    content.byuuid[sid] =seq;
                    seq.images = [];
                    if (!seq.imageStats) {
                        seq.imageStats = {};
                    }
                    if (seq.storedImages) {
                        for(const image of seq.storedImages!) {
                            const {device, path, ...stats} = {...image};
                            const status: ImageStatus = {device, path};

                            // Pour l'instant c'est brutal
                            const uuid = this.context.camera.imageIdGenerator.next();
                            this.context.camera.currentStatus.images.list.push(uuid);
                            this.context.camera.currentStatus.images.byuuid[uuid] = status;
                            seq.images.push(uuid);

                            seq.imageStats[uuid] = stats;
                        }
                    }
                    delete(seq.storedImages);
                }
                return content;
            },
            // write callback (add new images)
            (input:SequenceStatus["sequences"])=>{
                const content: Partial<SequenceStatus["sequences"]> = deepCopy(input);
                const arrivalTime = new Date().getTime();
                for(const sid of Object.keys(content.byuuid!)) {
                    const seq: Partial<Sequence> = content.byuuid![sid];
                    seq.storedImages = [];
                    for(const uuid of seq.images || []) {
                        if (hasKey(this.context.camera.currentStatus.images.byuuid, uuid)) {
                            const toWrite = {
                                            arrivalTime,
                                            ...this.context.camera.currentStatus.images.byuuid[uuid],
                                            ... Obj.getOwnProp(seq.imageStats, uuid)};
                            seq.storedImages.push(toWrite);
                        }
                    }
                    delete seq.images;
                    delete seq.imageStats;
                }
                return content;
            }
        );
        // Ensure no sequence is running on start


        this.pauseRunningSequences();

    }

    private completeSequence=(t:Partial<Sequence>): Sequence=>{
        const defaultSequence:Sequence = {
            activityMonitoring: {
                enabled: false
            },
            backgroundMonitoring: {
                enabled: false,
                evaluationCount: 5,
                evaluationPercentile: 0.5,
                learningCount: 5,
                learningPercentile: 0.5,
                perClassSettings:{},
                perClassStatus:{},
            },
            fwhmMonitoring: {
                enabled: false,
                evaluationCount: 5,
                evaluationPercentile: 0.5,
                learningCount: 5,
                learningPercentile: 0.5,
                perClassSettings:{},
                perClassStatus:{},
            },
            imageStats: {},
            images: [],
            imagingSetup: null,
            progress: null,
            root: {},
            status: 'error',
            errorMessage: 'Convertion error',
            stepStatus: {},
            title: 'invalid sequence',
        }
        return {...defaultSequence, ...t};
    }

    newSequence=async (ct: CancellationToken, message: {}):Promise<string>=>{
        const key = uuidv4();
        const firstSeq = uuidv4();
        // FIXME: takes parameters from the last created sequence
        this.currentStatus.sequences.byuuid[key] = this.completeSequence({
            status: 'idle',
            title: 'New sequence',
            progress: null,
            imagingSetup: null,
            errorMessage: null,

            root: {
                type: 'FRAME_LIGHT'
            },

            images: [],
            imageStats: {},
        });
        this.currentStatus.sequences.list.push(key);
        return key;
    }

    findSequenceFromRequest=(sequenceUid:string): Sequence=>
    {
        if (!hasKey(this.currentStatus.sequences.byuuid, sequenceUid)) {
            throw new Error("Sequence not found");
        }
        return this.currentStatus.sequences.byuuid[sequenceUid];
    }

    findStepFromRequest=(message: {sequenceUid:string, stepUidPath: string[]}): SequenceStep=>
    {
        const seq = this.findSequenceFromRequest(message.sequenceUid);

        let ret = seq.root;
        for(const childUuid of message.stepUidPath) {
            if ((!ret.childs) || !hasKey(ret.childs.byuuid, childUuid)) {
                throw new Error("Sequence step not found");
            }
            ret = ret.childs.byuuid[childUuid];
        }

        return ret;
    }

    newSequenceStep=async (ct: CancellationToken, message:BackOfficeAPI.NewSequenceStepRequest)=>{
        const parentStep = this.findStepFromRequest(message);

        if (!parentStep.childs) {
            parentStep.childs = {
                byuuid:{},
                list: [],
            };
        }

        if (message.removeParameterFromParent) {
            delete parentStep[message.removeParameterFromParent];
        }
        const ret: string[] = [];
        for(let i = 0; i < Math.max(1, message.count||0); ++i)
        {
            const sequenceStepUid = uuidv4();
            const newStep: SequenceStep = {
            };

            parentStep.childs.list.push(sequenceStepUid);
            parentStep.childs.byuuid[sequenceStepUid] = newStep;
            ret.push(sequenceStepUid);
        }
        return ret;
    }

    moveSequenceSteps=async (ct: CancellationToken, message:BackOfficeAPI.MoveSequenceStepsRequest)=>{
        const parentStep = this.findStepFromRequest(message);
        if (!parentStep.childs) {
            throw new Error("Sequence has no childs");
        }

        for(const o of message.childs) {
            if (!hasKey(parentStep.childs.byuuid, o)) {
                throw new Error("Unknown child");
            }
        }
        const newSet = new Set(message.childs);
        if (newSet.size !== message.childs.length) {
            throw new Error("Duplicated child");
        }
        for(const o of parentStep.childs.list) {
            if (!newSet.has(o)) {
                throw new Error("missing child");
            }
        }

        parentStep.childs.list = message.childs;
    }

    pauseRunningSequences()
    {
        for(var k of Object.keys(this.currentStatus.sequences.byuuid))
        {
            var seq = this.currentStatus.sequences.byuuid[k];
            if (seq.status == "running") {
                logger.warn('Sequence interrupted by process death', {uuid: k, seq});
                seq.status ="paused";
            }
        }
    }

    public deleteSequenceStep = async(ct: CancellationToken, message:BackOfficeAPI.DeleteSequenceStepRequest)=>{
        const parentStep = this.findStepFromRequest(message);

        // FIXME: not for running step ?

        if ((!parentStep.childs) || !hasKey(parentStep.childs.byuuid, message.stepUid)) {
            throw new Error("Step not found");
        }

        delete parentStep.childs.byuuid[message.stepUid];
        let p;
        while ((p=parentStep.childs.list.indexOf(message.stepUid)) != -1) {
            parentStep.childs.list.splice(p, 1);
        }

        if (parentStep.childs.list.length === 0) {
            delete parentStep.childs;
        }
    }

    public updateSequence = async (ct: CancellationToken, message:BackOfficeAPI.UpdateSequenceRequest)=>{
        const seq = this.findSequenceFromRequest(message.sequenceUid);

        const param = message.param;
        const value = message.value;

        (seq as any)[param] = value;
    }

    public patchSequence = async (ct: CancellationToken, message: BackOfficeAPI.PatchSequenceRequest) => {
        const seq = this.findSequenceFromRequest(message.sequenceUid);

        const newSeq = deepCopy(JsonProxy.applyDiff(seq, message.patch));
        SequenceManager.syncOnUpdate(seq, newSeq);

        this.currentStatus.sequences.byuuid[message.sequenceUid] = newSeq;
    }

    // Adjust to sane values after update
    static syncOnUpdate(src: Sequence, dst: Sequence) {
        if (!Obj.deepEqual(src.activityMonitoring, dst.activityMonitoring)) {
            if (dst.activityMonitoring.enabled) {
                if ((dst.activityMonitoring.duration || -1 ) < 0 ) {
                    dst.activityMonitoring.duration = 300;
                }
            }
        }

        SequenceManager.syncStatMonitoring(src.fwhmMonitoring, dst.fwhmMonitoring);
        SequenceManager.syncStatMonitoring(src.backgroundMonitoring, dst.backgroundMonitoring);
    }


    static syncStatMonitoring(src: SequenceValueMonitoring, dst: SequenceValueMonitoring) {
        if (Obj.deepEqual(src, dst)) {
            return;
        }
        if (src.seuil && src.seuil < 0) {
            dst.seuil = undefined;
        }

        for(const jsc of Object.keys(dst.perClassStatus)) {
            const dstClassStatus = dst.perClassStatus[jsc];

            if (!Object.prototype.hasOwnProperty.call(src?.perClassStatus, jsc)) {
                dst.perClassStatus[jsc] = {
                    ...SequenceLogic.emptyMonitoringClassStatus,
                    ...dstClassStatus
                };
            }
        }
    }

    public resetStatMonitoringLearning = async(ct: CancellationToken, message: BackOfficeAPI.ResetStatMonitoringRequest)=> {
        const seq = this.findSequenceFromRequest(message.sequenceUid);
        const monitoring = seq[message.monitoring];

        const classSettings = Obj.getOwnProp(monitoring.perClassSettings, message.classId);

        if (classSettings !== undefined) {
            classSettings.learningMinTime = new Date().getTime();
        }

        const classStatus = Obj.getOwnProp(monitoring.perClassStatus, message.classId);
        if (classStatus !== undefined) {
            classStatus.learnedValue = null;
            classStatus.learnedCount = 0;
            classStatus.learningReady = false;
            if ((!classSettings?.disable) && (classSettings?.manualValue === undefined)) {
                classStatus.maxAllowedValue = null;
            }
        }
    }

    public resetStatMonitoringCurrent = async(ct: CancellationToken, message: BackOfficeAPI.ResetStatMonitoringRequest)=> {
        const seq = this.findSequenceFromRequest(message.sequenceUid);
        const monitoring = seq[message.monitoring];

        if (Obj.hasKey(monitoring.perClassSettings, message.classId)) {
            monitoring.perClassSettings[message.classId].evaluationMinTime = new Date().getTime();
        }
        if (Obj.hasKey(monitoring.perClassStatus, message.classId)) {
            seq[message.monitoring].perClassStatus[message.classId].currentValue = null;
            seq[message.monitoring].perClassStatus[message.classId].currentCount = 0;
        }
    }


    public patchSequenceStep = async (ct: CancellationToken, message:BackOfficeAPI.PatchSequenceStepRequest)=>{
        const parentStep = this.findStepFromRequest(message);

        jsonpatch.apply(parentStep, message.patch);
    }

    public updateSequenceStep = async (ct: CancellationToken, message:BackOfficeAPI.UpdateSequenceStepRequest)=>{
        const parentStep = this.findStepFromRequest(message);

        const param = message.param;
        const value = message.value;

        if (value === undefined) {
            delete (parentStep as any)[param];
        } else {
            (parentStep as any)[param] = value;
        }
    }

    public updateSequenceStepFocuser = async (ct: CancellationToken, message:BackOfficeAPI.UpdateSequenceStepFocuserRequest)=>{
        const parentStep = this.findStepFromRequest(message);
        const wanted = message.focuser;

        if (!wanted) {
            parentStep.focuser = null;
        } else {
            if (!parentStep.focuser) {
                // FIXME: recall default settings here
                parentStep.focuser = {...{}, once: false}
            }
            if (message.settings) {
                const s = message.settings;

                Object.assign(parentStep.focuser, message.settings);
                // FIXME: retain default settings ?
            }
        }

    }

    public updateSequenceStepDithering = async (ct: CancellationToken, message:BackOfficeAPI.UpdateSequenceStepDitheringRequest)=>{
        const parentStep = this.findStepFromRequest(message);
        const wanted = message.dithering;

        if (!wanted) {
            parentStep.dithering = null;
        } else {
            if (!parentStep.dithering) {
                parentStep.dithering = {...this.context.phd.currentStatus.configuration.preferredDithering, once: false}
            }
            if (message.settings) {
                const s = message.settings;
                if (s.amount !== undefined && (s.amount <= 0 || s.amount > 100)) {
                    throw new Error("invalid value for amount");
                }
                if (s.pixels !== undefined && (s.pixels <= 0 || s.pixels > 100)) {
                    throw new Error("invalid value for pixels");
                }
                if (s.time !== undefined && (s.time <= 0 || s.time > 1000)) {
                    throw new Error("invalid value for time");
                }
                if (s.timeout !== undefined && (s.timeout <= 0 || s.timeout > 1000)) {
                    throw new Error("invalid value for time");
                }

                Object.assign(parentStep.dithering, message.settings);

                // Retains as the new default values
                this.context.phd.currentStatus.configuration.preferredDithering = {...parentStep.dithering};
            }
        }
    }

    private needCoverScopeMessage(cameraId:string) {
        const devConf = this.indiManager.currentStatus.configuration.indiServer.devices;
        if (!hasKey(devConf, cameraId)) {
            return false;
        }

        return !devConf[cameraId].options.disableAskCoverScope;
    }

    private disableCoverScopeMessage(cameraId: string) {
        const devConf = this.indiManager.currentStatus.configuration.indiServer.devices;
        try {
            this.indiManager.doUpdateDriverParam({driver: cameraId, key: "disableAskCoverScope", value: true});
            this.context.notification.info("Cover scope message can be enabled in INDI tab");
        } catch(e) {
            this.context.notification.error("Unable to control cover scope message preference", e);
        }
    }

    private doStartSequence = async (ct: CancellationToken, uuid:string)=>{
        const getSequence=()=>{
            var rslt = this.currentStatus.sequences.byuuid[uuid];
            if (!rslt) {
                throw new Error("Sequence removed: " + uuid);
            }
            return rslt;
        }

        const computeStats = async (ct: CancellationToken, indiFrameType: string|undefined, shootResult: BackOfficeAPI.ShootResult, target: ImageStats, guideSteps: Array<PhdGuideStep>)=> {
            ct.throwIfCancelled();

            target.guideStats = GuideStats.computeGuideStats(guideSteps);

            const histogram = await this.imageProcessor.compute(ct,
                {
                    histogram: { source: {
                        path: shootResult.path,
                        streamId: "",
                    },
                    options: {
                        maxBits: 10
                    }
                },
            });

            const channelBlacks = histogram.map(ch=>this.imageProcessor.getHistgramAduLevel(ch, 0.2));

            target.backgroundLevel = channelBlacks.length ? channelBlacks.reduce((a, c)=>a+c, 0) / (1024 * channelBlacks.length) : undefined;

            if (indiFrameType === 'FRAME_LIGHT') {
                ct.throwIfCancelled();

                // FIXME: mutualise that somewhere
                logger.debug('Asking FWHM', {shootResult});
                const starFieldResponse = await this.imageProcessor.compute(ct, {
                    starField: { source: {
                        path: shootResult.path,
                        streamId: "",
                    }}
                });
                const starField = starFieldResponse.stars;
                logger.debug('Got starField', {shootResult, starField});
                let fwhm, starCount;
                starCount = starField.length;
                fwhm =  Algebra.starFieldFwhm(starField);
                if (isNaN(fwhm)) fwhm = undefined;

                if (fwhm === undefined) {
                    delete target.fwhm;
                } else {
                    target.fwhm = fwhm;
                }
                target.starCount = starCount;
                logger.info('Got FWHM', {shootResult, fwhm, starCount});
            }
        }

        const computeStatsWithMetrics = async (ct: CancellationToken, indiFrameType: string|undefined, shootResult: BackOfficeAPI.ShootResult, target: ImageStats, guideSteps: Array<PhdGuideStep>)=>{
            // FIXME :report error here
            await computeStats(ct, indiFrameType, shootResult, target, guideSteps);

            this.lastImageTime = Date.now();
            this.lastGuideStats = Obj.deepCopy(target.guideStats);
            this.lastBackgroundLevel = target.backgroundLevel;
            this.lastFwhm = target.fwhm;
            this.lastStarCount = target.starCount;

            logger.debug('Statistic updated', target);
        }

        const sequenceLogic = async (ct: CancellationToken) => {
            let scopeState: ScopeState = "light";
            let lastAwaiterCcdTemp: number|null|undefined;

            const sequenceActivityWatchdog = new SequenceActivityWatchdog(this.appStateManager, this.context, uuid);
            const sequenceFwhmWatcher = new SequenceStatisticWatcher(this.appStateManager, this.context, uuid, "fwhm", "fwhmMonitoring");
            const sequenceBackgroundWatcher = new SequenceStatisticWatcher(this.appStateManager, this.context, uuid, "backgroundLevel", "backgroundMonitoring");
            try {
                sequenceActivityWatchdog.reset(0);
                sequenceFwhmWatcher.start();
                sequenceBackgroundWatcher.start();
                while(true) {
                    ct.throwIfCancelled();

                    const sequence = getSequence();
                    const sequenceLogic = new SequenceLogic(sequence, uuidv4);

                    sequence.progress = null;
                    const nextStep = sequenceLogic.getNextStep();

                    if (nextStep === undefined) {
                        logger.info('Sequence terminated', {sequence, uuid});
                        return;
                    }

                    // const {stepId, step} = nextStep;

                    if (sequence.imagingSetup === null) {
                        throw new Error("No imaging setup specified");
                    }

                    const imagingSetupInstance = ()=> {
                        const isi = this.imagingSetupManager.getImagingSetupInstance(sequence.imagingSetup);

                        if (!isi.exists()) {
                            throw new Error("Unknown imaging setup");
                        }

                        return isi;
                    }

                    const cameraDevice = () => {
                        const isi = imagingSetupInstance();
                        const ret = isi.config().cameraDevice;
                        if (ret === null) {
                            throw new Error("Imaging setup has no camera");
                        }
                        return ret;
                    }

                    const filterWheelDevice = () => {
                        const isi = imagingSetupInstance();
                        const ret = isi.config().filterWheelDevice;
                        if (ret === null) {
                            throw new Error("Imaging setup has no filter wheel");
                        }
                        return ret;
                    }

                    // Check that camera is connected
                    const device = this.indiManager.checkDeviceConnected(cameraDevice());

                    const param : SequenceStep = sequenceLogic.getParameters(nextStep);

                    // Get the name of frame type
                    const stepTypeLabel =
                            (param.type ? device.getVector('CCD_FRAME_TYPE').getPropertyLabelIfExists(param.type) : undefined)
                            || 'image';

                    const progress = sequenceLogic.getProgress(nextStep);
                    this.currentSequenceProgress = progress;

                    {
                        const classifier = new SequenceParamClassifier();
                        sequenceLogic.scanParameters(classifier.addParameter);

                        sequence.currentImageClass = classifier.extractJcsIdForParameters(param);
                    }

                    const shootTitle = (progress.imagePosition + 1) + "/" + progress.totalCount
                                + (progress.totalTime > 0
                                    ? (" " + Math.round(100 * progress.timeSpent / progress.totalTime) + "%")
                                    : ""
                                );

                    if (!param.exposure) {
                        throw new Error("Exposure not specified for " + shootTitle);
                    }

                    const settings:CameraDeviceSettings = {...param, exposure: param.exposure};

                    settings.prefix = sanitizePath(sequence.title) + '_' + sanitizePath(stepTypeLabel);

                    if (param.filter) {
                        settings.prefix += '_' + sanitizePath(param.filter);
                    }

                    if (param.exposure < 1 || (param.exposure % 1)) {
                        settings.prefix += '_' + Math.floor(param.exposure * 1000) + 'ms';
                    } else {
                        settings.prefix += '_' + Math.floor(param.exposure) + 's';
                    }

                    settings.prefix += '_XXX';

                    const currentExecutionStatus = nextStep[nextStep.length - 1];
                    // Copy because it could change concurrently in case of removal/reorder
                    const currentExecutionUuid = currentExecutionStatus.status.execUuid;

                    // Adjust the cooler control now... we'll await it later...
                    if (param.ccdTemp !== undefined) {
                        // Force the setting on first call (workaround posible bugs in driver...)
                        if (this.context.camera.getCcdTempStatus(cameraDevice()).target !== param.ccdTemp
                            || lastAwaiterCcdTemp === undefined) {
                            logger.info('Adjusting ccdTemp', {ccdTemp: param.ccdTemp});
                            // Clear the previous temperature awaited
                            lastAwaiterCcdTemp = undefined;
                            if (param.ccdTemp !== null) {
                                sequence.progress = "Switching temperature";
                            } else {
                                sequence.progress = "Turning off CCD Cooler";
                            }
                            await this.context.camera.setCcdTempTarget(ct, { deviceId: cameraDevice(), targetCcdTemp: param.ccdTemp});
                        }
                    }

                    if (param.dithering
                        && nextStep[nextStep.length - 1].status.lastDitheredExecUuid != nextStep[nextStep.length - 1].status.execUuid) {

                        // FIXME: no dithering for first shoot of sequence
                        logger.info('Dithering required', {sequence, uuid, dithering: param.dithering});
                        sequence.progress = "Dither " + shootTitle;
                        await this.context.phd.dither(ct, param.dithering);
                        // Mark the dithering as done
                        currentExecutionStatus.status.lastDitheredExecUuid = currentExecutionUuid;
                        ct.throwIfCancelled();
                        continue;
                    }

                    // Send a cover scope dialog if required
                    const newScopeState:ScopeState = (param.type && hasKey(stateByFrameType, param.type)) ? stateByFrameType[param.type] : 'light';
                    if (newScopeState !== scopeState) {
                        if (this.needCoverScopeMessage(cameraDevice()))
                        {
                            // Check that camera is connected first
                            this.indiManager.checkDeviceConnected(cameraDevice());

                            // Ask confirmation
                            const acked = await this.context.notification.dialog<boolean|"neverask">(ct, coverMessageByFrameType[newScopeState],
                                                            [{title:"Ok", value: true}, {title:"Pause Seq", value: false}, {title:"Never ask", value: "neverask"}]);
                            if (!acked) {
                                throw new CancellationToken.CancellationError("User canceled");
                            }
                            if (acked === "neverask") {
                                this.disableCoverScopeMessage(cameraDevice());
                            }
                        }
                        scopeState = newScopeState;
                    }

                    let guiderInhibiter = this.context.phd.createInhibiter();

                    try {
                        if (param.filter) {
                            console.log('Setting filter to ' + param.filter);
                            sequence.progress = "Filter " + shootTitle;

                            const filterWheelDeviceId = filterWheelDevice();

                            if (filterWheelDeviceId === null) {
                                throw new Error("Imaging setup has no filter wheel");
                            }

                            this.indiManager.checkDeviceConnected(filterWheelDeviceId);

                            await this.context.filterWheel.changeFilter(ct, {
                                filterWheelDeviceId,
                                filterId: param.filter,
                            });

                            ct.throwIfCancelled();
                        }

                        if (param.focuser) {
                            let delta;

                            try {
                                delta = this.context.focuser.getFocuserDelta(sequence.imagingSetup || "invalid");
                            } catch(e) {
                                if (e instanceof Error) {
                                    throw new Error("Focuser: "+ e.message);
                                }
                                throw e;
                            }

                            logger.debug('Got focuser delta', {sequence, uuid, delta});

                            if (delta.fromCurWeight >= 1) {
                                logger.info('Focuser needs adjustment', {sequence, uuid, delta});
                                sequence.progress = "Adjusting focuser " + shootTitle + " (" + Math.round(delta.fromCur) +")";

                                if (this.context.focuser.needGuideInhibition(sequence.imagingSetup || "invalid")) {
                                    await guiderInhibiter.start(ct);
                                }

                                await this.context.focuser.moveFocuserWithBacklash(ct, sequence.imagingSetup || "invalid", delta.abs);

                                logger.info('Focuser adjustment done', {sequence, uuid});
                                ct.throwIfCancelled();
                            } else {
                                logger.info('Focuser is good enough', {sequence, uuid, delta});
                            }
                        }

                    } finally {
                        await guiderInhibiter.end(ct);
                    }
                    // FIXME : wait end of guiding to settle ?

                    // Verify cooler has settled down...
                    if (param.ccdTemp !== undefined) {
                        if (lastAwaiterCcdTemp !== param.ccdTemp) {
                            if (param.ccdTemp !== null) {
                                logger.info("Waiting for temperature");
                                sequence.progress = "CCD Cooler " + shootTitle;

                                let cpt = 0;
                                do {
                                    const status = this.context.camera.getCcdTempStatus(cameraDevice());
                                    if (status.target !== param.ccdTemp) {
                                        logger.warn("CCD target temperature drifted", status);
                                        throw new Error("CCD target temperature changed");
                                    }
                                    // Assume the temperature is generally going down.
                                    if (status.current <= param.ccdTemp && status.current >= param.ccdTemp - 0.5) {
                                        logger.info("CCD reached target temperature", status);
                                        break;
                                    }
                                    cpt++;
                                    if (cpt > 300) {
                                        logger.info("Giving up waiting for cooler");
                                        throw new Error("Failed to reach target CCD temperature");
                                    }
                                    await Sleep(ct, 1000);
                                } while(true);
                            }
                            lastAwaiterCcdTemp = param.ccdTemp;
                        }
                    }


                    sequence.progress = (stepTypeLabel) + " " + shootTitle;
                    ct.throwIfCancelled();

                    const guideSteps:Array<PhdGuideStep> = [];
                    const unregisterPhd = (param.type === 'FRAME_LIGHT') ? this.phd.listenForSteps((step)=>guideSteps.push(step)) : ()=>{};

                    logger.info('Starting exposure', {sequence, uuid, settings});
                    let shootResult;
                    try {
                        sequenceActivityWatchdog.reset(-settings.exposure);
                        shootResult = await this.context.camera.doShoot(ct, sequence.imagingSetup, ()=>(settings));
                    } finally {
                        unregisterPhd();
                    }
                    
                    progress.imagePosition++;
                    progress.timeSpent += param.exposure;

                    sequence.images.push(shootResult.uuid);
                    sequenceLogic.finish(currentExecutionStatus);

                    sequence.imageStats[shootResult.uuid] = Obj.noUndef({
                        arrivalTime: new Date().getTime(),
                        exposure: settings.exposure,
                        iso: param.iso,
                        type: param.type,
                        bin: param.bin,
                        filter: param.filter,
                    });
                    computeStatsWithMetrics(CancellationToken.CONTINUE, param.type, shootResult, sequence.imageStats[shootResult.uuid], guideSteps)
                        .finally(sequenceFwhmWatcher.updateStats)
                        .finally(sequenceBackgroundWatcher.updateStats);
                }
            } finally {
                sequenceActivityWatchdog.end();
                sequenceFwhmWatcher.end();
                sequenceBackgroundWatcher.end();
            }
        }

        const finishWithStatus = (s:'done'|'error'|'paused', e?:any)=>{
            if (e) {
                logger.error('Finish sequence', {uuid, status:s}, e);
            } else {
                logger.info('Finish sequence', {uuid, status:s});
            }

            var seq = this.currentStatus.sequences.byuuid[uuid];
            seq.status = s;
            if (e) {
                if (e instanceof TraceError) {
                    seq.errorMessage = "" + e.messages();
                } else if (e instanceof Error) {
                    seq.errorMessage = e.message;
                } else {
                    seq.errorMessage = "" + e;
                }
            } else {
                seq.errorMessage = null;
            }
            if (s === 'done') {
                delete seq.currentImageClass;
            }
            this.currentSequenceUuid = null;
            this.currentSequencePromise = null;

            if (s !== "paused") {
                this.context.notification.notify("Sequence " + seq.title + " " + s + (e ? ": " + e : ""));
            }
        }


        // Check no sequence is running ?
        if (this.currentSequencePromise !== null) {
            throw new Error("A sequence is already running");
        }

        if (!Obj.hasKey(this.currentStatus.sequences.byuuid, uuid)) {
            throw new Error("No sequence");
        }

        
        await (createTask(ct, async (task:Task<void>)=> {
            this.currentSequencePromise = task;
            this.currentSequenceProgress = null;
            this.currentSequenceUuid = uuid;
            this.currentStatus.sequences.byuuid[uuid].status = 'running';
            this.currentStatus.sequences.byuuid[uuid].errorMessage = null;
    
            try {
                task.cancellation.throwIfCancelled();
                await sequenceLogic(task.cancellation);
            } catch(e) {
                if (e instanceof CancellationToken.CancellationError) {
                    finishWithStatus('paused');
                } else {
                    finishWithStatus('error', e)
                }
                throw e;
            }
            finishWithStatus('done');
        }));
    }

    startSequence = async (ct: CancellationToken, message:{sequenceUid: string})=>{
        this.doStartSequence(ct, message.sequenceUid);
    }

    stopSequence = async (ct: CancellationToken, message:{sequenceUid: string})=>{
        if (this.currentSequenceUuid !== message.sequenceUid) {
            throw new Error("Sequence " + message.sequenceUid + " is not running");
        }

        this.currentSequencePromise!.cancel();
    }

    resetSequence = async (ct: CancellationToken, message:{sequenceUid: string})=>{
        const key = message.sequenceUid;
        if (this.currentSequenceUuid === key) {
            throw new Error("Sequence " + key + " is running");
        }

        if (!Object.prototype.hasOwnProperty.call(this.currentStatus.sequences.byuuid, key)) {
            throw new Error("Sequence " + key + " not found");
        }

        const sequence = this.currentStatus.sequences.byuuid[key];

        sequence.stepStatus = {};
        sequence.status = 'idle';
        sequence.progress = null;
        sequence.errorMessage = null;
        // for(const stepUuid of sequence.steps.list)
        // {
        //     const step = sequence.steps.byuuid[stepUuid];
        //     delete step.done;
        // }
    }

    dropSequence = async (ct: CancellationToken, message:{sequenceUid: string})=>{
        const key = message.sequenceUid;
        if (this.currentSequenceUuid === key) {
            throw new Error("Sequence " + key + " is running");
        }
        let i;
        while((i = this.currentStatus.sequences.list.indexOf(key)) != -1) {
            this.currentStatus.sequences.list.splice(i, 1);
        }
        delete(this.currentStatus.sequences.byuuid[key]);
    }

    public async metrics():Promise<Array<Metrics.Definition>> {
        let ret : Array<Metrics.Definition> = [];
        const alive = Date.now() - this.lastImageTime < 60000;

        ret.push({
            name: 'sequence_fwhm',
            help: 'last fwhm of LIGHT image from sequence',
            type: 'gauge',
            value: alive ? this.lastFwhm : undefined,
        });

        ret.push({
            name: 'sequence_background_level',
            help: 'adu level (0-1) of black (20% histogram) - of last LIGHT image from sequence',
            type: 'gauge',
            value: alive ? this.lastBackgroundLevel: undefined,
        });

        ret.push({
            name: 'sequence_guiding_rms',
            help: 'rms error for the last LIGHT image from sequence',
            type: 'gauge',
            value: alive ? nullToUndefined(this.lastGuideStats?.RADECDistanceRMS) : undefined,
        });

        ret.push({
            name: 'sequence_guiding_rms_ra',
            help: 'rms error (ra) for the last LIGHT image from sequence',
            type: 'gauge',
            value: alive ? nullToUndefined(this.lastGuideStats?.RADistanceRMS) : undefined,
        });

        ret.push({
            name: 'sequence_guiding_rms_dec',
            help: 'rms error (dec) for the last LIGHT image from sequence',
            type: 'gauge',
            value: alive ? nullToUndefined(this.lastGuideStats?.DECDistanceRMS) : undefined,
        });

        ret.push({
            name: 'sequence_guiding_peak',
            help: 'peak error for the last LIGHT image from sequence',
            type: 'gauge',
            value: alive ? nullToUndefined(this.lastGuideStats?.RADECDistancePeak) : undefined,
        });

        ret.push({
            name: 'sequence_guiding_peak_ra',
            help: 'peak error (ra) for the last LIGHT image from sequence',
            type: 'gauge',
            value: alive ? nullToUndefined(this.lastGuideStats?.RADistancePeak) : undefined,
        });

        ret.push({
            name: 'sequence_guiding_peak_dec',
            help: 'rms error (peak) for the last LIGHT image from sequence',
            type: 'gauge',
            value: alive ? nullToUndefined(this.lastGuideStats?.DECDistancePeak) : undefined,
        });


        ret.push({
            name: 'sequence_star_count',
            help: 'number of stars detected in LIGHT image from sequence',
            type: 'gauge',
            value: alive ? this.lastStarCount : undefined,
        });

        ret.push({
            name: 'sequence_image_total',
            help: 'target number of image in current sequence',
            type: 'gauge',
            value: this.currentSequenceProgress?.totalCount
        });

        ret.push({
            name: 'sequence_image_done',
            help: 'number of image done in current sequence',
            type: 'gauge',
            value: this.currentSequenceProgress?.imagePosition
        });

        ret.push({
            name: 'sequence_duration_total',
            help: 'target number of exposure seconds for current sequence',
            type: 'gauge',
            value: this.currentSequenceProgress?.totalTime
        });

        ret.push({
            name: 'sequence_duration_done',
            help: 'number of exposed seconds in current sequence',
            type: 'gauge',
            value: this.currentSequenceProgress?.timeSpent
        });

        return ret;
    }

    getAPI() {
        return {
            deleteSequenceStep: this.deleteSequenceStep,
            updateSequence: this.updateSequence,
            patchSequence: this.patchSequence,
            patchSequenceStep: this.patchSequenceStep,
            updateSequenceStep: this.updateSequenceStep,
            updateSequenceStepDithering: this.updateSequenceStepDithering,
            updateSequenceStepFocuser: this.updateSequenceStepFocuser,
            moveSequenceSteps: this.moveSequenceSteps,
            newSequence: this.newSequence,
            newSequenceStep: this.newSequenceStep,
            startSequence: this.startSequence,
            stopSequence: this.stopSequence,
            resetSequence: this.resetSequence,
            dropSequence: this.dropSequence,
            resetStatMonitoringLearning: this.resetStatMonitoringLearning,
            resetStatMonitoringCurrent: this.resetStatMonitoringCurrent,
        }
    }
}


function nullToUndefined(e:number|null|undefined):number|undefined {
    if (e === null) {
        return undefined;
    } else {
        return e;
    }
}

function sanitizePath(p : string) {
    // Be cool with windows
    return p.replace(/[\/\.\*\?\:\\ ]+/g, '-');
}
