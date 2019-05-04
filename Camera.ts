import uuid from 'node-uuid';
const TraceError = require('trace-error');

import CancellationToken from 'cancellationtoken';
import { ExpressApplication, AppContext } from "./ModuleBase";
import {CameraStatus, ShootSettings, BackofficeStatus, Sequence} from './shared/BackOfficeStatus';
import JsonProxy from './JsonProxy';
import { hasKey, deepCopy } from './Obj';
import { DriverInterface, Vector } from './Indi';
import {Task, createTask} from "./Task.js";
import {timestampToEpoch} from "./Indi";
import {IdGenerator} from "./IdGenerator";
import * as Obj from "./Obj";
import * as RequestHandler from "./RequestHandler";
import * as BackOfficeAPI from "./shared/BackOfficeAPI";
import ConfigStore from './ConfigStore';

export default class Camera
        implements RequestHandler.APIAppProvider<BackOfficeAPI.CameraAPI>
{
    appStateManager: JsonProxy<BackofficeStatus>;
    shootPromises: {[camId: string]:Task<BackOfficeAPI.ShootResult>};
    currentStatus: CameraStatus;
    context: AppContext;
    get indiManager() { return this.context.indiManager };
    get imageProcessor() { return this.context.imageProcessor };

    imageIdGenerator = new IdGenerator();
    previousImages: any;
    
    currentSequenceUuid:string|null = null;
    currentSequencePromise:Task<void>|null = null;
    fakeImageId: number = 0;
    constructor(app:ExpressApplication, appStateManager:JsonProxy<BackofficeStatus>, context:AppContext) {
        this.appStateManager = appStateManager;
        this.appStateManager.getTarget().camera = {
            status: "idle",
            selectedDevice: null,
            preferedDevice: null,
            availableDevices: [],

            // The settings, some may not be available
            currentSettings: {
                bin: 1,
                exposure: 1.0,
                iso: null
            },

            // Device => duration
            currentShoots: {

            },

            // List of finished images
            images: {
                list: [],

                // detail of each image
                byuuid: {
                    // 0: {
                    //      path: "/path/to/file.fits",
                    //      device: "device"
                    // }

                }
            },
            lastByDevices: {},
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



            configuration: {}
        };

        // Device => promise
        this.shootPromises = {};
        this.currentStatus = this.appStateManager.getTarget().camera;
        this.context = context;

        this.imageIdGenerator = new IdGenerator();
        this.previousImages = {};
        

        new ConfigStore(appStateManager, 'camera', ['camera', 'configuration'], {
            fakeImagePath: null,
            fakeImages: null,
            defaultImagePath: process.env.HOME,
            defaultImagePrefix: 'IMAGE_XXX'
        }, {
            fakeImagePath: "/home/ludovic/Astronomie/home/photos/2015/2015-08-09/photos/2015-08-09/",
            fakeImages: [
                    "Single_Bin1x1_1s_2015-08-09_23-40-17.fit",  "Single_Bin1x1_1s_2015-08-09_23-44-44.fit",  "Single_Bin1x1_30s_2015-08-09_23-47-04.fit",  "Single_Bin2x2_2s_2015-08-09_23-28-37.fit",      "Single_M27_Bin1x1_2s_2015-08-10_03-40-12.fit",
                    "Single_Bin1x1_1s_2015-08-09_23-41-16.fit",  "Single_Bin1x1_30s_2015-08-09_23-42-37.fit",  "Single_Bin1x1_5s_2015-08-09_23-41-47.fit",   "Single_Bin2x2_2s_2015-08-09_23-29-41.fit",      "Single_M27_G_Bin1x1_2s_2015-08-10_03-46-49.fit",
                    "Single_Bin1x1_1s_2015-08-09_23-44-21.fit",  "Single_Bin1x1_30s_2015-08-09_23-45-37.fit",  "Single_Bin2x2_2s_2015-08-09_23-27-56.fit",   "Single_M27_Bin1x1_1s_2015-08-10_03-39-51.fit"
            ],
            defaultImagePath: process.env.HOME,
            defaultImagePrefix: 'IMAGE_XXX'
        });

        new ConfigStore(appStateManager, 'sequences', ['camera', 'sequences'], {
            list: [],
            byuuid: {}
        },{
            list: [],
            byuuid: {}
        },
            // read callback
            (content:CameraStatus["sequences"])=> {
                for(const sid of Object.keys(content.byuuid)) {
                    const seq = content.byuuid[sid];
                    seq.images = [];
                    if (seq.storedImages) {
                        for(const image of seq.storedImages!) {
                            // Pour l'instant c'est brutal
                            const uuid = this.imageIdGenerator.next();
                            this.currentStatus.images.list.push(uuid);
                            this.currentStatus.images.byuuid[uuid] = image;
                            seq.images.push(uuid);
                        }
                    }
                    delete(seq.storedImages);
                }
                return content;
            },
            // write callback (add new images)
            (content:CameraStatus["sequences"])=>{
                content = deepCopy(content);
                for(const sid of Object.keys(content.byuuid)) {
                    const seq = content.byuuid[sid];
                    seq.storedImages = [];
                    for(const uuid of seq.images) {
                        if (hasKey(this.currentStatus.images.byuuid, uuid)) {
                            seq.storedImages.push(this.currentStatus.images.byuuid[uuid]);
                        }
                    }
                    delete seq.images;
                }
                return content;
            }
        );
        // Ensure no sequence is running on start


        this.pauseRunningSequences();
        
        // Update available camera
        context.indiManager.createDeviceListSynchronizer((devs:string[])=> {
            this.currentStatus.availableDevices = devs;
        }, undefined, DriverInterface.CCD);
        
        // Update shoots
        this.appStateManager.addSynchronizer(
            [
                [
                    [
                        'indiManager', 'deviceTree', null, 'CCD_EXPOSURE',
                        [
                            ['childs', 'CCD_EXPOSURE_VALUE', '$_'],
                            ['$state']
                        ]
                    ],
                    [
                        'camera', 'availableDevices'
                    ]
                ]
            ], this.updateRunningShoots.bind(this), true);

        this.appStateManager.addSynchronizer(
            [
                [
                    [   'indiManager', 'deviceTree', null, 'CCD_FILE_PATH', '$rev' ],
                    [   'camera', 'availableDevices']
                ]
            ], this.updateDoneImages.bind(this), true
        );
        this.updateDoneImages();
    }

    updateDoneImages()
    {
        var indiManager = this.appStateManager.getTarget().indiManager;
        // Ensure that the CCD_FILE_PATH property is set for all devices
        var found:{[deviceId:string]:string} = {};
        for(var device of this.currentStatus.availableDevices)
        {
            
            var rev, value;
            try {
                var dtree =  indiManager.deviceTree[device];
                if ("CCD_FILE_PATH" in dtree) {
                    rev = dtree.CCD_FILE_PATH.$rev;
                    var timestamp = dtree.CCD_FILE_PATH.$timestamp;
                    value = dtree.CCD_FILE_PATH.childs.FILE_PATH.$_;

                    if (value === undefined) {
                        continue;
                    }

                    // Ignore CCD_FILE_PATH that are from before connection
                    // Some buggy drivers send spurious CCD_FILE_PATH message, not distinguishable from new shoot
                    if (!Object.prototype.hasOwnProperty.call(dtree, "CONNECTION")) {
                        continue;
                    }
                    var age = timestampToEpoch(timestamp) - timestampToEpoch(dtree.CONNECTION.$timestamp);
                    if (age <= 2) {
                        console.log('Ignored CCD_FILE_PATH from before last connection event : ' + age);
                        continue;
                    }

                } else {
                    continue;
                }
            } catch(e) {
                console.log('Error with device ' + device, e);
                continue;
            }
            var stamp = rev + ":" + value;
            
            found[device] = stamp;
            if (!Object.prototype.hasOwnProperty.call(this.previousImages, device))
            {
                this.previousImages[device] = stamp;
            } else {
                if (this.previousImages[device] != stamp) {
                    console.log('changed value from ' + this.previousImages[device]);
                    this.previousImages[device] = stamp;
                    if (value != '') {

                        var currentShoot;
                        if (Object.prototype.hasOwnProperty.call(this.currentStatus.currentShoots, device)) {
                            currentShoot = this.currentStatus.currentShoots[device];
                        } else {
                            currentShoot = undefined;
                        }
                        if (currentShoot != undefined && currentShoot.managed) {
                            console.log('Image will be result of our action.', value)
                        } else {
                            console.log('New external image :', value);

                            var newUuid = this.imageIdGenerator.next();

                            this.currentStatus.images.list.push(newUuid);
                            this.currentStatus.images.byuuid[newUuid] = {
                                path: value,
                                device: device
                            };
                        }
                    }
                }
            }
        }
        // console.log('Known devices are : ' + JSON.stringify(Object.keys(this.previousImages)));
        // console.log('Devices with stamp : ' + JSON.stringify(found));
        for(var o of Object.keys(this.previousImages))
        {
            if (!found[o]) {
                console.log('No more looking for shoot of ' + o);
                delete(this.previousImages[o]);
            }
        }
    }

    updateRunningShoots()
    {
        var indiManager = this.appStateManager.getTarget().indiManager;
        var connectedDevices = [];
        for(var deviceId of Object.keys(indiManager.deviceTree).sort()) {
            var device = indiManager.deviceTree[deviceId];
            var status, exposure;
            try {
                status = device.CCD_EXPOSURE.$state;
                exposure = device.CCD_EXPOSURE.childs.CCD_EXPOSURE_VALUE.$_;
                exposure = parseFloat(exposure);
            } catch(e) {
                continue;
            }
            connectedDevices.push(deviceId);
            var currentShoot;
            if (Object.prototype.hasOwnProperty.call(this.currentStatus.currentShoots, deviceId)) {
                currentShoot = this.currentStatus.currentShoots[deviceId];
            } else {
                currentShoot = undefined;
            }

            if (status == 'Busy' && exposure > 0) {
                // Create a shoot
                if (currentShoot === undefined) {
                    currentShoot= {
                        exposure: exposure,
                        expLeft: exposure,
                        type: 'external'
                    };
                    this.currentStatus.currentShoots[deviceId] = currentShoot;
                } else {
                    if (exposure > 0 || currentShoot.expLeft) {
                        currentShoot.expLeft = exposure;
                    }
                    if (exposure > currentShoot.exposure) {
                        currentShoot.exposure = exposure;
                    }
                }
            } else {
                // Destroy the shoot, if not managed
                if (currentShoot !== undefined) {
                    if (currentShoot.managed) {
                        if (status !== 'Busy') exposure = 0;
                        if (exposure > 0 || currentShoot.expLeft) {
                            currentShoot.expLeft = exposure;
                        }
                    } else {
                        delete this.currentStatus.currentShoots[deviceId];
                    }
                }
            }
        }
        // destroy shoots of disconnected devices
        for(var k of Object.keys(this.currentStatus.currentShoots))
        {
            if (connectedDevices.indexOf(k) == -1) {
                delete this.currentStatus.currentShoots[k];
            }
        }
    }

    setCamera=async (ct: CancellationToken, payload:{device:string})=>{
        console.log('Request to set device: ', JSON.stringify(payload.device));
        if (this.currentStatus.availableDevices.indexOf(payload.device) == -1) {
            throw "device not available";
        }
        this.currentStatus.selectedDevice = payload.device;
    }

    setShootParam=async<K extends keyof ShootSettings> (ct: CancellationToken, payload:{key:K, value: ShootSettings[K]})=>{
        // FIXME: send the corresponding info ?
        console.log('Request to set setting: ', JSON.stringify(payload));
        var key = payload.key;
        if (!Object.prototype.hasOwnProperty.call(this.currentStatus.currentSettings, key)) {
            throw "property not supported by device: " + key;
        }
        this.currentStatus.currentSettings[key] = payload.value;
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

                var settings:ShootSettings = Object.assign({}, sequence) as any;
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
                }

                sequence.progress = (stepTypeLabel) + " " + shootTitle;
                ct.throwIfCancelled();
                const shootResult = await this.doShoot(ct, sequence.camera, ()=>(settings));
                
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
                await sequenceLogic(ct);
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

    getCropAdjustment(device:any)
    {
        const frameVec = device.getVector('CCD_FRAME');
        if (!frameVec.exists()) {
            return {};
        }

        const ccdVec = device.getVector('CCD_INFO');
        if (!ccdVec.exists()) {
            return {};
        }
        const crop = {
            x: parseFloat(frameVec.getPropertyValue('X')),
            y: parseFloat(frameVec.getPropertyValue('Y')),
            w: parseFloat(frameVec.getPropertyValue('WIDTH')),
            h: parseFloat(frameVec.getPropertyValue('HEIGHT'))
        }
        const max = {
            w: parseFloat(ccdVec.getPropertyValue('CCD_MAX_X')),
            h: parseFloat(ccdVec.getPropertyValue('CCD_MAX_Y')),
        }

        const binningVec = device.getVector('CCD_BINNING');
        const bin = binningVec.exists() ?
            {
                x:parseFloat(binningVec.getPropertyValue('HOR_BIN')),
                y:parseFloat(binningVec.getPropertyValue('VER_BIN'))
            }
            : {x: 1, y: 1};
        console.log('Crop status is '+ JSON.stringify(crop, null, 2));
        console.log('Frame status is '+ JSON.stringify(max, null, 2));
        console.log('Bin status is '+ JSON.stringify(bin, null, 2));
        if (crop.x || crop.y || crop.w != max.w || crop.h  != max.h) {
            return {
                X: "0",
                Y: "0",
                WIDTH: "" + Math.floor(max.w),
                HEIGHT: "" + Math.floor(max.h)
            };
        }

        return {};
    }

    // Return a promise to shoot at the given camera (where)
    async doShoot(cancellation: CancellationToken, device:string, settingsProvider?:(s:ShootSettings)=>ShootSettings):Promise<BackOfficeAPI.ShootResult>
    {
        // On veut un objet de controle qui comporte à la fois la promesse et la possibilité de faire cancel
        var connection:any;
        var ccdFilePathInitRevId:any;
        let shootResult:BackOfficeAPI.ShootResult;

        if (Object.prototype.hasOwnProperty.call(this.currentStatus.currentShoots, device)) {
            throw new Error("Shoot already started for " + device);
        }

        var settings = Object.assign({}, this.currentStatus.currentSettings);
        if (settingsProvider !== undefined) {
            settings = settingsProvider(settings);
        }
        console.log('Shoot settings:' + JSON.stringify(settings, null, 2));
        this.currentStatus.currentShoots[device] = Object.assign({
                    status: 'init',
                    managed: true,
                    path: this.currentStatus.configuration.defaultImagePath || process.env.HOME,
                    prefix: this.currentStatus.configuration.defaultImagePrefix || 'IMAGE_XXX'
                }, settings);

        return await createTask<BackOfficeAPI.ShootResult>(cancellation, async (task)=>{
            this.shootPromises[device] = task;
        
            try {
                const currentShootSettings = this.currentStatus.currentShoots[device];
                console.log('Starting shoot: ' + JSON.stringify(currentShootSettings));
                var exposure = currentShootSettings.exposure;
                if (exposure === null || exposure === undefined) {
                    exposure = 0.1;
                }
                currentShootSettings.exposure = exposure;
                    
                    // Set the binning - if prop is present only
                if (currentShootSettings.bin !== null
                    && this.indiManager.getValidConnection().getDevice(device).getVector('CCD_BINNING').exists())
                {
                    task.cancellation.throwIfCancelled();
                    await this.indiManager.setParam(task.cancellation, device, 'CCD_BINNING', {
                                HOR_BIN: currentShootSettings.bin,
                                VER_BIN: currentShootSettings.bin
                            });
                }
                // Reset the frame size - if prop is present only
                if (Object.keys(this.getCropAdjustment(this.indiManager.getValidConnection().getDevice(device))).length != 0) {
                    await this.indiManager.setParam(task.cancellation, device, 'CCD_FRAME', this.getCropAdjustment(this.indiManager.getValidConnection().getDevice(device)), true);
                }

                // Set the iso
                if (currentShootSettings.iso !== null
                        && this.indiManager.getValidConnection().getDevice(device).getVector('CCD_ISO').exists()) {
                    task.cancellation.throwIfCancelled();
                    await this.indiManager.setParam(task.cancellation, device, 'CCD_ISO',
                        // FIXME : support cb for setParam
                        (vector:Vector) => {
                            const vec = vector.getVectorInTree();
                            const v = currentShootSettings.iso;
                            var childToSet = undefined;
                            for(var id of vec.childNames)
                            {
                                var child = vec.childs[id];
                                if (child.$label == v) {
                                    childToSet = id;
                                    break;
                                }
                            }
                            if (childToSet === undefined) throw new Error("Unsupported iso value: " + v);

                            return ({[childToSet]: 'On'});
                        }
                    );
                }

                task.cancellation.throwIfCancelled();
                await this.indiManager.setParam(task.cancellation, device, 'UPLOAD_SETTINGS',
                        (vec:Vector)=> {
                            const ret = {};

                            if (vec.getPropertyValueIfExists('UPLOAD_DIR') !== currentShootSettings.path
                                || vec.getPropertyValueIfExists('UPLOAD_PREFIX') !== currentShootSettings.prefix)
                            {
                                return {
                                    UPLOAD_DIR: currentShootSettings.path,
                                    UPLOAD_PREFIX: currentShootSettings.prefix
                                }
                            } else {
                                return {}
                            }
                        });
                
                // Set the upload mode to at least upload_client
                task.cancellation.throwIfCancelled();
                await this.indiManager.setParam(task.cancellation, device, 'UPLOAD_MODE',
                        (vec:Vector) => {
                            if (vec.getPropertyValueIfExists('UPLOAD_CLIENT') == 'On') {
                                console.log('want upload_client\n');
                                return {
                                    UPLOAD_BOTH: 'On'
                                }
                            } else {
                                return ({});
                            }
                        });

                await this.indiManager.waitForVectors(task.cancellation, device, ['CCD_FILE_PATH']);

                const connection = this.indiManager.connection;
                if (connection == undefined) {
                    throw "Indi server not connected";
                }

                ccdFilePathInitRevId = connection.getDevice(device).getVector("CCD_FILE_PATH").getRev();

                var expVector = connection.getDevice(device).getVector("CCD_EXPOSURE");

                task.cancellation.throwIfCancelled();
                expVector.setValues([{name: 'CCD_EXPOSURE_VALUE', value: currentShootSettings.exposure }]);

                
                const doneWithExposure = task.cancellation.onCancelled(() => {
                        // FIXME: we must wait, otherwise a new shoot can begin while these are still occuring.
                        var expVector = connection.getDevice(device).getVector("CCD_ABORT_EXPOSURE");
                        expVector.setValues([{name: 'ABORT', value: 'On'}]);
                        var uploadModeVector = connection.getDevice(device).getVector("UPLOAD_MODE");
                        uploadModeVector.setValues([{name: 'UPLOAD_CLIENT', value: 'On'}]);
                });
                try {
                    // Make this uninterruptible
                    await connection.wait(CancellationToken.CONTINUE, () => {
                        console.log('Waiting for exposure end');

                        var value = expVector.getPropertyValue("CCD_EXPOSURE_VALUE");
                        var state = expVector.getState();
                        if (value != "0") {
                            currentShootSettings.status = 'Exposing';
                        } else if (state == "Busy" && currentShootSettings.status == 'Exposing') {
                            currentShootSettings.status = 'Downloading';
                        }

                        if (state === "Busy") {
                            return false;
                        }
                        if (state !== "Ok" && state !== "Idle") {
                            throw new Error("Exposure failed");
                        }

                        return (value == "0");
                    });
                } finally {
                    doneWithExposure();
                }
                task.cancellation.throwIfCancelled();
                if (ccdFilePathInitRevId === connection.getDevice(device).getVector("CCD_FILE_PATH").getRev())
                {
                    throw new Error("CCD_FILE_PATH was not updated");
                }

                var value = connection.getDevice(device).getVector("CCD_FILE_PATH").getPropertyValue("FILE_PATH");

                console.log('Finished  image acquisistion :', value);

                if (this.currentStatus.configuration.fakeImages != null) {
                    var examples = this.currentStatus.configuration.fakeImages;
                    value = examples[(this.fakeImageId++)%examples.length];
                    if (this.currentStatus.configuration.fakeImagePath != null) {
                        value = this.currentStatus.configuration.fakeImagePath + value;
                    }
                    console.log('Using fake image : ' + value);
                }
                this.currentStatus.lastByDevices[device] = value;

                var newUuid = this.imageIdGenerator.next();

                this.currentStatus.images.list.push(newUuid);
                this.currentStatus.images.byuuid[newUuid] = {
                    path: value,
                    device: device
                };
                shootResult = ({path: value, device, uuid: newUuid});

                // Remove UPLOAD_MODE
                // FIXME: this should be in a finally !
                await this.indiManager.setParam(task.cancellation, device, 'UPLOAD_MODE',
                        (vec:Vector) => {
                            if (vec.getPropertyValueIfExists('UPLOAD_CLIENT') != 'On') {
                                console.log('set back upload_client\n');
                                return {
                                    UPLOAD_CLIENT: 'On'
                                }
                            } else {
                                return ({});
                            }
                        });
                return shootResult;
            } finally {
                console.log('Doing cleanup');
                delete this.shootPromises[device];
                delete this.currentStatus.currentShoots[device];
            }
        });
    }


    shoot = async (ct: CancellationToken, message:{})=>{
        if (this.currentStatus.selectedDevice === null) {
            throw new Error("No camera selected");
        }
        return await this.doShoot(ct, this.currentStatus.selectedDevice);
    }

    abort = async (ct: CancellationToken, message:{})=>{
        let currentDevice = this.currentStatus.selectedDevice;
        if (currentDevice === null) throw new Error("No camera selected");

        if (Object.prototype.hasOwnProperty.call(this.shootPromises, currentDevice)) {
            this.shootPromises[currentDevice].cancel();
        } else {
            // FIXME: be more aggressive about abort !
            throw new Error("Shoot not initiated on our side. Not aborting");
        }
    }

    getAPI() {
        return {
            shoot: this.shoot,
            abort: this.abort,
            setCamera: this.setCamera,
            setShootParam: this.setShootParam,
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
