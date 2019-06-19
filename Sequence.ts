import uuid from 'node-uuid';
const TraceError = require('trace-error');

import CancellationToken from 'cancellationtoken';
import { ExpressApplication, AppContext } from "./ModuleBase";
import { CameraDeviceSettings, BackofficeStatus, SequenceStatus} from './shared/BackOfficeStatus';
import JsonProxy from './JsonProxy';
import { hasKey, deepCopy } from './Obj';
import {Task, createTask} from "./Task.js";
import {IdGenerator} from "./IdGenerator";
import * as Obj from "./Obj";
import * as RequestHandler from "./RequestHandler";
import * as BackOfficeAPI from "./shared/BackOfficeAPI";
import ConfigStore from './ConfigStore';




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

export default class Sequence
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
            },
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
        const key = uuid.v4();
        const firstSeq = uuid.v4();
        this.currentStatus.sequences.byuuid[key] = {
            status: 'idle',
            title: 'New sequence',
            progress: null,
            camera: null,
            errorMessage: null,
            steps: {
                list: [firstSeq],
                byuuid: {
                    [firstSeq]: {
                        count:  1,
                        type:   'FRAME_LIGHT'
                    }
                }
            },
            images: []
        };
        this.currentStatus.sequences.list.push(key);
        return key;
    }

    newSequenceStep=async (ct: CancellationToken, message:{sequenceUid: string})=>{
        console.log('Request to add step: ', JSON.stringify(message));
        var sequenceUid = message.sequenceUid;
        var sequenceStepUid = uuid.v4();
        this.currentStatus.sequences.byuuid[sequenceUid].steps.byuuid[sequenceStepUid] = { count: 1, type: 'FRAME_LIGHT'};
        this.currentStatus.sequences.byuuid[sequenceUid].steps.list.push(sequenceStepUid);
        return sequenceStepUid;
    }

    moveSequenceSteps=async (ct: CancellationToken, message:{sequenceUid:string, sequenceStepUidList: string[]})=>{
        console.log('Request to move steps: ', JSON.stringify(message));
        var sequenceUid = message.sequenceUid;
        var sequenceStepUidList = message.sequenceStepUidList;
        // Check that no uid is lost
        var currentSequenceStepUidList = this.currentStatus.sequences.byuuid[sequenceUid].steps.list;
        if (sequenceStepUidList.length != currentSequenceStepUidList.length) {
            throw new Error("Sequence step list size mismatch. Concurrent modification ?");
        }
        for(var i = 0; i < currentSequenceStepUidList.length; ++i) {
            if (sequenceStepUidList.indexOf(currentSequenceStepUidList[i]) == -1) {
                throw new Error("Missing step in new order. Concurrent modification ?");
            }
        }
        for(var i = 0; i < sequenceStepUidList.length; ++i) {
            if (currentSequenceStepUidList.indexOf(sequenceStepUidList[i]) == -1) {
                throw new Error("Unknown step in new order. Concurrent modification ?");
            }
        }
        this.currentStatus.sequences.byuuid[sequenceUid].steps.list = sequenceStepUidList;
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
        const {sequenceUid, sequenceStepUid} = message;
        var sequenceStepUidList = this.currentStatus.sequences.byuuid[sequenceUid].steps.list;
        var pos = sequenceStepUidList.indexOf(sequenceStepUid);
        if (pos == -1) {
            console.warn('step ' + sequenceStepUid + ' not found in ' + JSON.stringify(sequenceStepUidList));
            throw new Error("Step not found");
        }
        sequenceStepUidList.splice(pos, 1);
        delete this.currentStatus.sequences.byuuid[sequenceUid].steps.byuuid[sequenceStepUid];
    }

    public updateSequence = async (ct: CancellationToken, message:BackOfficeAPI.UpdateSequenceRequest)=>{
        console.log('Request to set setting: ', JSON.stringify(message));
        var key = message.sequenceUid;
        var param = message.param;
        var value = message.value;

        if (message.sequenceStepUid !== undefined) {
            var sequenceStepUid = message.sequenceStepUid;
            (this.currentStatus.sequences.byuuid[key].steps.byuuid[sequenceStepUid] as any)[param] = value;
        } else {
            (this.currentStatus.sequences.byuuid[key] as any)[param] = value;
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

        const getNextStep=()=>{
            var sequence = getSequence();
            var stepsUuid = sequence.steps.list;
            for(var i = 0; i < stepsUuid.length; ++i)
            {
                var stepUuid = stepsUuid[i];
                var step = sequence.steps.byuuid[stepUuid];
                if (!('done' in step)) {
                    step.done = 0;
                }
                if (step.done! < step.count) {
                    return {stepId: i, step};
                }
            }
            return undefined;
        }

        const sequenceLogic = async (ct: CancellationToken) => {
            while(true) {
                ct.throwIfCancelled();

                const sequence = getSequence();
                sequence.progress = null;
                console.log('Shoot in sequence:' + JSON.stringify(sequence));
                const nextStep = getNextStep();

                if (nextStep === undefined) {
                    console.log('Sequence terminated: ' + uuid);
                    return;
                }

                const {stepId, step} = nextStep;

                if (sequence.camera === null) {
                    throw new Error("No device specified");
                }

                // Check that camera is connected
                const device = this.indiManager.checkDeviceConnected(sequence.camera);

                // Get the name of frame type
                const stepTypeLabel = device.getVector('CCD_FRAME_TYPE').getPropertyLabelIfExists(step.type) || step.type || 'image';


                this.indiManager.getValidConnection().getDevice(sequence.camera).getVector('CONNECTION')

                const shootTitle =
                        ((step.done || 0) + 1) + "/" + step.count +
                        (sequence.steps.list.length > 1 ?
                            " (#" +(stepId + 1) + "/" + sequence.steps.list.length+")" : "");

                var settings:CameraDeviceSettings = Object.assign({}, sequence) as any;
                delete (settings as any).steps;
                delete (settings as any).errorMessage;
                settings = Object.assign(settings, step);
                delete (settings as any).count;
                delete (settings as any).done;
                settings.prefix = sequence.title + '_' + stepTypeLabel + '_XXX';
                var ditheringStep;
                if (step.dither) {
                    // FIXME: no dithering for first shoot of sequence
                    console.log('Dithering required : ', Object.keys(this.context));
                    sequence.progress = "Dither " + shootTitle;
                    await this.context.phd.dither(ct);
                    ct.throwIfCancelled();
                }
                if (step.filter) {
                    console.log('Setting filter to ' + step.filter);
                    await this.context.filterWheel.changeFilter(ct, {
                        cameraDeviceId: sequence.camera,
                        filterId: step.filter,
                    });
                    ct.throwIfCancelled();
                }

                sequence.progress = (stepTypeLabel) + " " + shootTitle;
                ct.throwIfCancelled();
                const shootResult = await this.context.camera.doShoot(ct, sequence.camera, ()=>(settings));
                
                sequence.images.push(shootResult.uuid);
                step.done = (step.done || 0 ) + 1;
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

        sequence.status = 'idle';
        sequence.errorMessage = null;
        for(const stepUuid of sequence.steps.list)
        {
            const step = sequence.steps.byuuid[stepUuid];
            delete step.done;
        }
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