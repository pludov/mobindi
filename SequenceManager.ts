import {v4 as uuidv4} from 'node-uuid';
const TraceError = require('trace-error');

import CancellationToken from 'cancellationtoken';
import { ExpressApplication, AppContext } from "./ModuleBase";
import { CameraDeviceSettings, BackofficeStatus, SequenceStatus, Sequence, SequenceStep, SequenceStepStatus} from './shared/BackOfficeStatus';
import JsonProxy from './JsonProxy';
import { hasKey, deepCopy } from './Obj';
import {Task, createTask} from "./Task.js";
import {IdGenerator} from "./IdGenerator";
import * as Obj from "./Obj";
import * as RequestHandler from "./RequestHandler";
import * as BackOfficeAPI from "./shared/BackOfficeAPI";
import ConfigStore from './ConfigStore';



type SequenceWithStatus = {
    step: SequenceStep;
    status: SequenceStepStatus;
};

type SequenceSize = {
    totalCount: number;
    totalTime: number;
}

type Progress = {
    /** 0 based */
    imagePosition: number;
    timeSpent: number;
} & SequenceSize;

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
    sequenceIdGenerator: IdGenerator;
    get indiManager() { return this.context.indiManager };
    
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
            (content:SequenceStatus["sequences"])=> {
                for(const sid of Object.keys(content.byuuid)) {
                    const seq = content.byuuid[sid];
                    seq.images = [];
                    if (seq.storedImages) {
                        for(const image of seq.storedImages!) {
                            // Pour l'instant c'est brutal
                            const uuid = this.sequenceIdGenerator.next();
                            this.context.camera.currentStatus.images.list.push(uuid);
                            this.context.camera.currentStatus.images.byuuid[uuid] = image;
                            seq.images.push(uuid);
                        }
                    }
                    delete(seq.storedImages);
                }
                return content;
            },
            // write callback (add new images)
            (content:SequenceStatus["sequences"])=>{
                content = deepCopy(content);
                for(const sid of Object.keys(content.byuuid)) {
                    const seq = content.byuuid[sid];
                    seq.storedImages = [];
                    for(const uuid of seq.images) {
                        if (hasKey(this.context.camera.currentStatus.images.byuuid, uuid)) {
                            seq.storedImages.push(this.context.camera.currentStatus.images.byuuid[uuid]);
                        }
                    }
                    delete seq.images;
                }
                return content;
            }
        );
        // Ensure no sequence is running on start


        this.pauseRunningSequences();

    }

    newSequence=async (ct: CancellationToken, message: {}):Promise<string>=>{
        const key = uuidv4();
        const firstSeq = uuidv4();
        // FIXME: takes parameters from the last created sequence
        this.currentStatus.sequences.byuuid[key] = {
            status: 'idle',
            title: 'New sequence',
            progress: null,
            camera: null,
            errorMessage: null,

            root: {
            },
            stepStatus: {
            },

            images: []
        };
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
        console.log('Request to add step(s): ', JSON.stringify(message));

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
        console.log('Request to move steps: ', JSON.stringify(message));

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
                console.log('Sequence ' + k + ' was interrupted by process shutdown');
                seq.status ="paused";
            }
        }
    }

    public deleteSequenceStep = async(ct: CancellationToken, message:BackOfficeAPI.DeleteSequenceStepRequest)=>{
        console.log('Request to drop step: ', JSON.stringify(message));
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
        console.log('Request to set setting: ', JSON.stringify(message));
        const seq = this.findSequenceFromRequest(message.sequenceUid);

        const param = message.param;
        const value = message.value;

        (seq as any)[param] = value;
    }

    public updateSequenceStep = async (ct: CancellationToken, message:BackOfficeAPI.UpdateSequenceStepRequest)=>{
        console.log('Request to set setting: ', JSON.stringify(message));

        const parentStep = this.findStepFromRequest(message);

        const param = message.param;
        const value = message.value;

        if (value === undefined) {
            delete (parentStep as any)[param];
        } else {
            (parentStep as any)[param] = value;
        }
    }

    public updateSequenceStepDithering = async (ct: CancellationToken, message:BackOfficeAPI.UpdateSequenceStepDitheringRequest)=>{
        console.log('Request to set dithering settings: ', JSON.stringify(message));

        const parentStep = this.findStepFromRequest(message);
        const wanted = message.dithering;

        if (!wanted) {
            parentStep.dithering = null;
        } else {
            if (!parentStep.dithering) {
                parentStep.dithering = {...this.context.phd.currentStatus.configuration.preferredDithering}
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

        const statusDone=(current: SequenceWithStatus)=>{
            if ((current.status.finishedLoopCount || 0) >= Math.max(current.step.repeat || 0, 1)) {
                return true;
            }
            return false;
        }

        const finish=(current: SequenceWithStatus)=>{
            current.status.finishedLoopCount = (current.status.finishedLoopCount || 0) + 1;
            current.status.execUuid = uuidv4();
        }

        const getExecution=(stepUuid: string, parentExec?: SequenceStepStatus): SequenceStepStatus|null=>{
            const sequence = getSequence();
            if (Object.prototype.hasOwnProperty.call(sequence.stepStatus, stepUuid)) {
                const currentStatus = sequence.stepStatus[stepUuid];
                if (parentExec === undefined
                    || currentStatus.parentExecUuid === parentExec.execUuid)
                {
                    return currentStatus;
                }
            }
            return null;
        }

        const getOrCreateExecution=(stepUuid: string, parentExec?: SequenceStepStatus): SequenceStepStatus=>{
            const status = getExecution(stepUuid, parentExec);
            if (status !== null) {
                return status;
            }
            const sequence = getSequence();
            const newStatus:SequenceStepStatus = {
                execUuid: uuidv4(),
                parentExecUuid: parentExec ? parentExec.execUuid : null,
                finishedLoopCount: 0,
            };
            sequence.stepStatus[stepUuid] = newStatus;
            // Read back
            return sequence.stepStatus[stepUuid];
        }

        const calcExposure=(step: SequenceStep[]): number=>{
            let exp: number = 0;
            for(const s of step) {
                if (s.exposure !== undefined) {
                    exp = s.exposure;
                }
            }
            return exp;
        }

        const totalCount=(steps:SequenceStep[]):SequenceSize=>{
            const step = steps[steps.length - 1]
            const mult = Math.max(step.repeat || 1, 1);

            const size: SequenceSize = {
                totalCount: 0,
                totalTime: 0,
            };
            if (step.childs && step.childs.list.length) {
                for(const child of step.childs.list) {
                    const childSize = totalCount(steps.concat([step.childs.byuuid[child]]));
                    size.totalCount += childSize.totalCount;
                    size.totalTime += childSize.totalTime;
                }
            } else {
                size.totalCount= 1;
                size.totalTime= calcExposure(steps);
            }

            size.totalCount *= mult;
            size.totalTime *= mult;
            return size;
        }

        const getProgress=(stepStack: Array<{step: SequenceStep, status: SequenceStepStatus}>, start?: number):Progress=>{
            if (start === undefined) {
                start = 0;
            }

            const v = stepStack[start];
            const loopCount = Math.max(v.step.repeat || 0, 1);
            const doneCount = v.status.finishedLoopCount;

            if (start === stepStack.length -1) {
                const expValue = calcExposure(stepStack.map(e=>e.step));
                return {
                    totalCount: loopCount,
                    imagePosition: doneCount,
                    totalTime: loopCount * expValue,
                    timeSpent: doneCount * expValue,
                }
            }

            let ret: Progress = {
                imagePosition: 0,
                totalCount: 0,
                timeSpent: 0,
                totalTime: 0,
            }

            // We have childs. Account in position until active child is viewed
            let activeChildFound : boolean = v.status.activeChild === undefined;
            for(const childUuid of v.step.childs!.list) {
                if (childUuid === v.status.activeChild) {
                    const v = getProgress(stepStack, start + 1);
                    ret.imagePosition += v.imagePosition;
                    ret.timeSpent += v.timeSpent;
                    ret.totalCount += v.totalCount;
                    ret.totalTime += v.totalTime;

                    activeChildFound = true;
                } else {
                    const c = totalCount(stepStack.slice(0, start + 1).map(e=>e.step).concat([v.step.childs!.byuuid[childUuid]]));
                    ret.totalCount += c.totalCount;
                    ret.totalTime += c.totalTime;
                    if (!activeChildFound) {
                        ret.imagePosition += c.totalCount;
                        ret.timeSpent += c.totalTime;
                    }
                }
            }

            // account for repeat
            ret.imagePosition += ret.totalCount * doneCount;
            ret.timeSpent += ret.totalTime * doneCount;
            ret.totalCount *= loopCount;
            ret.totalTime *= loopCount;

            return ret;
        }


        const getNextStep=()=>{
            const sequence = getSequence();
            const stepStack: Array<{step: SequenceStep, status: SequenceStepStatus}>= [];


            // Pop the head if false
            const enter= ()=>
            {
                const current = stepStack[stepStack.length - 1];
                if (current.step.childs) {
                    // step has childs. Must go down
                    // Iterate all childs. If they are all done, the exec is finished

                    for(let inc = 0; (!statusDone(current)) && inc <= 1; ++inc) {
                        // Restart from activeChild
                        const childUuid = current.status.activeChild;
                        let toTry = childUuid
                                    ? [childUuid, ...current.step.childs.list.filter(e=>e!==childUuid)]
                                    : current.step.childs.list;

                        for(const childUid of toTry) {
                            stepStack.push({
                                step: current.step.childs.byuuid[childUid],
                                status: getOrCreateExecution(childUid, current.status)
                            });

                            if (enter()) {
                                current.status.activeChild = childUid;
                                return true;
                            }
                            if (current.status.activeChild !== undefined) {
                                delete current.status.activeChild;
                            }
                        }

                        if (inc == 0) {
                            // Nothing is possible. Start a new loop
                            finish(current);
                        }
                    }
                } else {
                    if (!statusDone(current)) {
                        return true;
                    }
                }

                // Pop the entry
                stepStack.splice(stepStack.length - 1, 1);
            }

            stepStack.push({step: sequence.root, status: getOrCreateExecution("root")});
            if (!enter()) {
                return undefined;
            }
            return stepStack;
        }

        const sequenceLogic = async (ct: CancellationToken) => {
            let scopeState: ScopeState = "light";

            while(true) {
                ct.throwIfCancelled();

                const sequence = getSequence();
                sequence.progress = null;
                const nextStep = getNextStep();

                if (nextStep === undefined) {
                    console.log('Sequence terminated: ' + uuid);
                    return;
                }

                // const {stepId, step} = nextStep;

                if (sequence.camera === null) {
                    throw new Error("No device specified");
                }

                // Check that camera is connected
                const device = this.indiManager.checkDeviceConnected(sequence.camera);

                const param : SequenceStep = {};
                // FIXME: not valid for dither once
                for(const o of nextStep) {
                    Object.assign(param, o.step);
                }
                delete param.childs;
                delete param.repeat;

                // Get the name of frame type
                const stepTypeLabel =
                        (param.type ? device.getVector('CCD_FRAME_TYPE').getPropertyLabelIfExists(param.type) : undefined)
                        || 'image';

                const progress = getProgress(nextStep);

                const shootTitle = (progress.imagePosition + 1) + "/" + progress.totalCount
                            + (progress.totalTime > 0
                                ? (" " + Math.round(100 * progress.timeSpent / progress.totalTime) + "%")
                                : ""
                            );

                if (!param.exposure) {
                    throw new Error("Exposure not specified for " + shootTitle);
                }

                const settings:CameraDeviceSettings = {...param, exposure: param.exposure};

                settings.prefix = sequence.title + '_' + stepTypeLabel + '_XXX';

                const currentExecutionStatus = nextStep[nextStep.length - 1];
                // Copy because it could change concurrently in case of removal/reorder
                const currentExecutionUuid = currentExecutionStatus.status.execUuid;

                if (param.dithering
                    && nextStep[nextStep.length - 1].status.lastDitheredExecUuid != nextStep[nextStep.length - 1].status.execUuid) {

                    // FIXME: no dithering for first shoot of sequence
                    console.log('Dithering required : ', Object.keys(this.context), JSON.stringify(param.dithering));
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
                    if (this.needCoverScopeMessage(sequence.camera))
                    {
                        // Check that camera is connected first
                        this.indiManager.checkDeviceConnected(sequence.camera);

                        // Ask confirmation
                        const acked = await this.context.notification.dialog<boolean|"neverask">(ct, coverMessageByFrameType[newScopeState],
                                                        [{title:"Ok", value: true}, {title:"Pause Seq", value: false}, {title:"Never ask", value: "neverask"}]);
                        if (!acked) {
                            throw new CancellationToken.CancellationError("User canceled");
                        }
                        if (acked === "neverask") {
                            this.disableCoverScopeMessage(sequence.camera);
                        }
                    }
                    scopeState = newScopeState;
                }

                if (param.filter) {
                    console.log('Setting filter to ' + param.filter);
                    sequence.progress = "Filter " + shootTitle;
                    await this.context.filterWheel.changeFilter(ct, {
                        cameraDeviceId: sequence.camera,
                        filterId: param.filter,
                    });
                    ct.throwIfCancelled();
                }

                sequence.progress = (stepTypeLabel) + " " + shootTitle;
                ct.throwIfCancelled();
                const shootResult = await this.context.camera.doShoot(ct, sequence.camera, ()=>(settings));
                
                sequence.images.push(shootResult.uuid);
                finish(currentExecutionStatus);
            }
        }

        const finishWithStatus = (s:'done'|'error'|'paused', e?:any)=>{
            console.log('finishing with final status: ' + s);
            if (e) {
                console.log('Error ' , e);
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
        console.log('Request to reset sequence', JSON.stringify(message));
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
        console.log('Request to drop sequence', JSON.stringify(message));
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

    getAPI() {
        return {
            deleteSequenceStep: this.deleteSequenceStep,
            updateSequence: this.updateSequence,
            updateSequenceStep: this.updateSequenceStep,
            updateSequenceStepDithering: this.updateSequenceStepDithering,
            moveSequenceSteps: this.moveSequenceSteps,
            newSequence: this.newSequence,
            newSequenceStep: this.newSequenceStep,
            startSequence: this.startSequence,
            stopSequence: this.stopSequence,
            resetSequence: this.resetSequence,
            dropSequence: this.dropSequence,
        }
    }
}