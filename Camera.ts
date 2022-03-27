import CancellationToken from 'cancellationtoken';
import MemoryStreams from 'memory-streams';
import Log from './Log';
import { ExpressApplication, AppContext } from "./ModuleBase";
import {CameraStatus, CameraDeviceSettings, BackofficeStatus, Sequence, ImageStatus, CameraShoot} from './shared/BackOfficeStatus';
import JsonProxy from './shared/JsonProxy';
import { Vector } from './Indi';
import {Task, createTask} from "./Task.js";
import {timestampToEpoch} from "./Indi";
import {IdGenerator} from "./IdGenerator";
import * as Obj from "./shared/Obj";
import * as RequestHandler from "./RequestHandler";
import * as BackOfficeAPI from "./shared/BackOfficeAPI";
import ConfigStore from './ConfigStore';
import { Pipe } from './SystemPromise';


type ScopeState = "light"|"dark"|"flat";

const logger = Log.logger(__filename);

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

export default class Camera
        implements RequestHandler.APIAppProvider<BackOfficeAPI.CameraAPI>
{
    appStateManager: JsonProxy<BackofficeStatus>;
    shootPromises: {[camId: string]:Task<BackOfficeAPI.ShootResult>};
    streamPromises: {[camId: string]:Task<void>};
    currentStatus: CameraStatus;
    context: AppContext;
    get indiManager() { return this.context.indiManager };
    get imageProcessor() { return this.context.imageProcessor };

    imageIdGenerator = new IdGenerator();
    previousImages: any;
    
    fakeImageId: number = 0;
    constructor(app:ExpressApplication, appStateManager:JsonProxy<BackofficeStatus>, context:AppContext) {
        this.appStateManager = appStateManager;
        this.appStateManager.getTarget().camera = {
            status: "idle",
            currentImagingSetup: null,

            currentStreams: {},

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

            dynStateByDevices: {},
            configuration: {
                preferedImagingSetup: null,
            }
        };

        // Device => promise
        this.shootPromises = {};
        this.streamPromises = {};
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

        context.imagingSetupManager.createPreferredImagingSelector({
            currentPath: [ 'camera', 'currentImagingSetup' ],
            preferedPath: [ 'camera', 'configuration', 'preferedImagingSetup' ],
            read: ()=> ({
                prefered: this.currentStatus.configuration.preferedImagingSetup,
                current: this.currentStatus.currentImagingSetup,
            }),
            set: (s:{prefered?: string|null|undefined, current?: string|null|undefined})=>{
                if (s.prefered !== undefined) {
                    this.currentStatus.configuration.preferedImagingSetup = s.prefered;
                }
                if (s.current !== undefined) {
                    this.currentStatus.currentImagingSetup = s.current;
                }
            }
        });
        // Update configuration/dyn states
        this.appStateManager.addSynchronizer(
            [ 'indiManager', 'availableCameras' ],
            ()=> {
                const dynStateRoot = this.currentStatus.dynStateByDevices;
                for(const o of this.indiManager.currentStatus.availableCameras) {
                    if (!Obj.hasKey(dynStateRoot, o)) {
                        dynStateRoot[o] = {}
                    }
                }
            },
            true);

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
                        'indiManager', 'availableCameras'
                    ]
                ]
            ], this.updateRunningShoots.bind(this), true);

        this.appStateManager.addSynchronizer(
            [
                [
                    [   'indiManager', 'deviceTree', null, 'CCD_FILE_PATH', '$rev' ],
                    [   'indiManager', 'availableCameras']
                ]
            ], this.updateDoneImages.bind(this), true
        );
        this.updateDoneImages();
    }

    getImageByUuid(uuid:string): ImageStatus|undefined {
        if (Obj.hasKey(this.currentStatus.images.byuuid, uuid)) {
            return this.currentStatus.images.byuuid[uuid];
        }
        return undefined;
    }

    updateDoneImages()
    {
        var indiManager = this.appStateManager.getTarget().indiManager;
        // Ensure that the CCD_FILE_PATH property is set for all devices
        var found:{[deviceId:string]:string} = {};
        for(var device of indiManager.availableCameras)
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
                        logger.warn('Ignored CCD_FILE_PATH from before last connection event', {age, vector: dtree.CCD_FILE_PATH});
                        continue;
                    }

                } else {
                    continue;
                }
            } catch(e) {
                logger.error('Error in CCD_FILE_PATH handling', {device}, e);
                continue;
            }
            var stamp = rev + ":" + value;
            
            found[device] = stamp;
            if (!Object.prototype.hasOwnProperty.call(this.previousImages, device))
            {
                this.previousImages[device] = stamp;
            } else {
                if (this.previousImages[device] != stamp) {
                    logger.debug('changed value', {device, old: this.previousImages[device], new: stamp});
                    this.previousImages[device] = stamp;
                    if (value != '') {

                        let currentShoot;
                        if (Object.prototype.hasOwnProperty.call(this.currentStatus.currentShoots, device)) {
                            currentShoot = this.currentStatus.currentShoots[device];
                        } else {
                            currentShoot = undefined;
                        }
                        if (currentShoot != undefined && currentShoot.managed) {
                            logger.debug('Image will be result of our action.', {value})
                        } else {
                            logger.info('New external image', {value});

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

        for(var o of Object.keys(this.previousImages))
        {
            if (!found[o]) {
                logger.debug('No more looking for shoot',{device: o});
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
            let currentShoot;
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
                        status: 'External' as 'External',
                        managed: false,
                    };
                    this.currentStatus.currentShoots[deviceId] = currentShoot;
                    if (Obj.hasKey(this.currentStatus.dynStateByDevices, deviceId)) {
                        this.currentStatus.dynStateByDevices[deviceId].spyRecommanded = true;
                    }
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

    setCurrentImagingSetup=async (ct: CancellationToken, message:{imagingSetup:null|string})=>{
        if (message.imagingSetup !== null && !this.context.imagingSetupManager.getImagingSetupInstance(message.imagingSetup).exists()) {
            throw new Error("invalid imaging setup");
        }
        this.currentStatus.currentImagingSetup = message.imagingSetup;
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
        logger.debug('Crop status', {crop, max, bin});
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

    private resolveImagingSetup(imagingSetup: string|null) {
        const imagingSetupInstance = this.context.imagingSetupManager.getImagingSetupInstance(imagingSetup);
        if (!imagingSetupInstance.exists()) {
            throw new Error("Invalid imaging setup");
        }

        const device = imagingSetupInstance.config().cameraDevice;
        if (device === null) {
            throw new Error("No camera configured");
        }
        if (this.indiManager.currentStatus.availableCameras.indexOf(device) === -1) {
            throw new Error("Camera not found");
        }

        return {imagingSetupInstance, device};
    }

    private async applyShootSettings(task: Task<any>, device: string, currentShootSettings: CameraDeviceSettings) {
        var exposure = currentShootSettings.exposure;
        if (exposure === null || exposure === undefined) {
            exposure = 0.1;
        }
        currentShootSettings.exposure = exposure;

            // Set the binning - if prop is present only
        if (currentShootSettings.bin !== null
            && currentShootSettings.bin !== undefined
            && this.indiManager.getValidConnection().getDevice(device).getVector('CCD_BINNING').exists())
        {
            task.cancellation.throwIfCancelled();
            logger.debug('Bin upgrade', {device});
            await this.indiManager.setParam(task.cancellation, device, 'CCD_BINNING', {
                        HOR_BIN: '' + currentShootSettings.bin!,
                        VER_BIN: '' + currentShootSettings.bin!
                    });
        }
        // Reset the frame size - if prop is present only
        if (Object.keys(this.getCropAdjustment(this.indiManager.getValidConnection().getDevice(device))).length != 0) {
            task.cancellation.throwIfCancelled();
            logger.debug('set crop', {device});
            await this.indiManager.setParam(task.cancellation, device, 'CCD_FRAME', this.getCropAdjustment(this.indiManager.getValidConnection().getDevice(device)), true);
        }

        // Set the iso
        if (currentShootSettings.iso !== null
                && currentShootSettings.iso !== undefined
                && this.indiManager.getValidConnection().getDevice(device).getVector('CCD_ISO').exists()) {
            task.cancellation.throwIfCancelled();
            logger.debug('set iso', {device});
            await this.indiManager.setParam(task.cancellation, device, 'CCD_ISO',
                // FIXME : support cb for setParam
                (vector:Vector) => {
                    const vec = vector.getExistingVectorInTree();
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
                    logger.debug('found iso', {device, childToSet});
                    return ({[childToSet]: 'On'});
                }
            );
        }
    }

    // Return a promise to shoot at the given camera (where)
    async doShoot(cancellation: CancellationToken, imagingSetup:string, settingsProvider?:(s:CameraDeviceSettings)=>CameraDeviceSettings):Promise<BackOfficeAPI.ShootResult>
    {
        // On veut un objet de controle qui comporte à la fois la promesse et la possibilité de faire cancel
        var ccdFilePathInitRevId:any;
        let shootResult:BackOfficeAPI.ShootResult;

        const {imagingSetupInstance, device} = this.resolveImagingSetup(imagingSetup);

        if (Object.prototype.hasOwnProperty.call(this.currentStatus.currentShoots, device)) {
            throw new Error("Shoot already started for " + device);
        }

        if (Object.prototype.hasOwnProperty.call(this.currentStatus.currentStreams, device)) {
            throw new Error("Stream is already started for " + device);
        }

        let settings = Object.assign({}, imagingSetupInstance.config().cameraSettings);
        if (settingsProvider !== undefined) {
            settings = settingsProvider(settings);
        }
        this.currentStatus.currentShoots[device] = Object.assign({
                    status: 'init' as "init",
                    managed: true,
                    path: this.currentStatus.configuration.defaultImagePath || process.env.HOME,
                    prefix: this.currentStatus.configuration.defaultImagePrefix || 'IMAGE_XXX',
                    expLeft: settings.exposure,
                }, settings);

        return await createTask<BackOfficeAPI.ShootResult>(cancellation, async (task)=>{
            this.shootPromises[device] = task;
        
            try {
                const currentShootSettings = this.currentStatus.currentShoots[device];
                logger.info('Starting shoot', {device, settings: currentShootSettings});
                
                await this.applyShootSettings(task, device, currentShootSettings);

                task.cancellation.throwIfCancelled();
                await this.indiManager.setParam(task.cancellation, device, 'UPLOAD_SETTINGS',
                        (vec:Vector)=> {
                            const ret = {};

                            if (vec.getPropertyValueIfExists('UPLOAD_DIR') !== currentShootSettings.path
                                || vec.getPropertyValueIfExists('UPLOAD_PREFIX') !== currentShootSettings.prefix)
                            {
                                logger.debug('adjusting UPLOAD_DIR/UPLOAD_PREFIX', {device});
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
                                logger.debug('want upload_client', {device});
                                return {
                                    UPLOAD_BOTH: 'On'
                                }
                            } else {
                                return ({});
                            }
                        });

                logger.debug('wait readiness of CCD_FILE_PATH', {device});
                await this.indiManager.waitForVectors(task.cancellation, device, ['CCD_FILE_PATH']);

                const connection = this.indiManager.connection;
                if (connection == undefined) {
                    throw "Indi server not connected";
                }

                ccdFilePathInitRevId = connection.getDevice(device).getVector("CCD_FILE_PATH").getRev();

                var expVector = connection.getDevice(device).getVector("CCD_EXPOSURE");

                task.cancellation.throwIfCancelled();
                logger.debug('starting exposure', {device});
                expVector.setValues([{name: 'CCD_EXPOSURE_VALUE', value: '' + currentShootSettings.exposure! }]);

                
                const doneWithExposure = task.cancellation.onCancelled(() => {
                        // FIXME: we must wait, otherwise a new shoot can begin while these are still occuring.
                        var expVector = connection.getDevice(device).getVector("CCD_ABORT_EXPOSURE");
                        expVector.setValues([{name: 'ABORT', value: 'On'}]);
                        var uploadModeVector = connection.getDevice(device).getVector("UPLOAD_MODE");
                        uploadModeVector.setValues([{name: 'UPLOAD_CLIENT', value: 'On'}]);
                });
                let nextLog = new Date().getTime() + currentShootSettings.exposure * 1000  + 5000;
                try {
                    // Make this uninterruptible
                    await connection.wait(CancellationToken.CONTINUE, () => {
                        logger.debug('Checking for exposure end', {device});

                        var value = expVector.getPropertyValue("CCD_EXPOSURE_VALUE");
                        var state = expVector.getState();
                        if (value != "0") {
                            currentShootSettings.status = 'Exposing';
                        } else if (state == "Busy" && currentShootSettings.status == 'Exposing') {
                            currentShootSettings.status = 'Downloading';
                        }

                        if (state === "Busy") {
                            if (new Date().getTime() > nextLog) {
                                logger.info('Still waiting exposure', {device, settings: currentShootSettings});
                                nextLog = new Date().getTime() + 5000;
                            }
                            return false;
                        }
                        if (state !== "Ok" && state !== "Idle") {
                            logger.warn('Wrong exposure state', {device, state});
                            throw new Error("Exposure failed");
                        }

                        logger.debug('Exposure done', {device});
                        return true;
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

                logger.debug('Finished  image acquisistion', {device, value});

                if (this.currentStatus.configuration.fakeImages != null) {
                    var examples = this.currentStatus.configuration.fakeImages;
                    value = examples[(this.fakeImageId++)%examples.length];
                    if (this.currentStatus.configuration.fakeImagePath != null) {
                        value = this.currentStatus.configuration.fakeImagePath + value;
                    }
                    logger.warn('Using fake image', {device, value});
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
                                logger.debug('set back upload_client', {device});
                                return {
                                    UPLOAD_CLIENT: 'On'
                                }
                            } else {
                                return ({});
                            }
                        });
                logger.info('Image acquisistion done', shootResult);
                return shootResult;
            } finally {
                logger.debug('Doing cleanup', {device});
                delete this.shootPromises[device];
                delete this.currentStatus.currentShoots[device];
            }
        });
    }

    async doLoopExposure(cancellation: CancellationToken, imagingSetup:string, settingsProvider?:(s:CameraDeviceSettings)=>CameraDeviceSettings) {
        const {imagingSetupInstance, device} = this.resolveImagingSetup(imagingSetup);
        let settings = Object.assign({}, imagingSetupInstance.config().cameraSettings);
        if (settingsProvider !== undefined) {
            settings = settingsProvider(settings);
        }
        return await createTask<void>(cancellation, async (task)=>{
                logger.info('Starting shoot', {device, settings: settings});

                this.currentStatus.currentShoots[device] = Object.assign({
                    status: 'init' as "init",
                    managed: true,
                    path: null,
                    prefix: null,
                    expLeft: settings.exposure,
                }, settings);

                const currentShootSettings = this.currentStatus.currentShoots[device];


                await this.applyShootSettings(task, device, settings);

                task.cancellation.throwIfCancelled();

                const connection = this.indiManager.connection;
                if (connection == undefined) {
                    throw "Indi server not connected";
                }

                var expVector = connection.getDevice(device).getVector("CCD_EXPOSURE");

                task.cancellation.throwIfCancelled();
                logger.debug('starting loop exposure', {device});
                expVector.setValues([{name: 'CCD_EXPOSURE_VALUE', value: '' + settings.exposure! }]);

                const doneWithExposure = task.cancellation.onCancelled(() => {
                        // FIXME: we must wait, otherwise a new shoot can begin while these are still occuring.
                        var expVector = connection.getDevice(device).getVector("CCD_ABORT_EXPOSURE");
                        expVector.setValues([{name: 'ABORT', value: 'On'}]);
                });
                let nextLog = new Date().getTime() + settings.exposure * 1000  + 5000;
                try {
                    // Make this uninterruptible
                    await connection.wait(CancellationToken.CONTINUE, () => {
                        logger.debug('Checking for exposure end', {device});

                        var value = expVector.getPropertyValue("CCD_EXPOSURE_VALUE");
                        var state = expVector.getState();
                        if (value != "0") {
                            currentShootSettings.status = 'Exposing';
                        } else if (state == "Busy" && currentShootSettings.status == 'Exposing') {
                            currentShootSettings.status = 'Downloading';
                        }

                        if (state === "Busy") {
                            if (new Date().getTime() > nextLog) {
                                logger.info('Still waiting exposure', {device, settings});
                                nextLog = new Date().getTime() + 5000;
                            }
                            return false;
                        }
                        if (state !== "Ok" && state !== "Idle") {
                            logger.warn('Wrong exposure state', {device, state});
                            throw new Error("Exposure failed");
                        }

                        logger.debug('Exposure done', {device});
                        return true;
                    });
                } finally {
                    delete this.currentStatus.currentShoots[device];
                    doneWithExposure();
                }
                task.cancellation.throwIfCancelled();

                logger.debug('Finished loop image acquisistion', {device});
        });
    }

    async loopExposure(cancellation: CancellationToken, imagingSetup:string) {
        while(true) {
            cancellation.throwIfCancelled();
            await this.doLoopExposure(cancellation, imagingSetup);
        }
    }

    // Return a promise to stream the given camera
    async doStream(cancellation: CancellationToken, imagingSetup:string, loopExposure: boolean):Promise<void>
    {
        const {imagingSetupInstance, device} = this.resolveImagingSetup(imagingSetup);


        if (Object.prototype.hasOwnProperty.call(this.currentStatus.currentShoots, device)
                && this.currentStatus.currentShoots[device].managed) {
            throw new Error("Shoot already started for " + device);
        }

        if (Object.prototype.hasOwnProperty.call(this.currentStatus.currentStreams, device)) {
            throw new Error("Stream is already started for " + device);
        }

        return await createTask<void>(cancellation, async (task)=>{
            this.streamPromises[device] = task;
            delete this.currentStatus.currentShoots[device];
            try {
                this.currentStatus.currentStreams[device] = {
                    streamId: null,
                    streamSize: null,
                    serial: null,
                    autoexp: null,
                    subframe: null,
                    frameSize: null,
                };


                task.cancellation.throwIfCancelled();
                logger.info('Starting passive streaming', {device});
                // Set the upload mode to at least upload_client
                await this.indiManager.setParam(task.cancellation, device, 'UPLOAD_MODE',
                        (vec:Vector) => {
                            if (vec.getPropertyValueIfExists('UPLOAD_CLIENT') === 'Off') {
                                logger.debug('want upload_client for stream', {device});
                                return {
                                    UPLOAD_CLIENT: 'On'
                                }
                            } else {
                                return ({});
                            }
                        });

                task.cancellation.throwIfCancelled();

                let loopExposureTask;
                if (loopExposure) {
                    loopExposureTask = createTask(task.cancellation, async (loopTask)=>{
                        try {
                            await this.loopExposure(loopTask.cancellation, imagingSetup)
                        } catch(e) {
                            if (e instanceof CancellationToken.CancellationError) {
                                return;
                            }
                            // This is fatal... Propagate
                            logger.warn('loop exposure failed', e);
                            task.cancel(e);
                        }
                    });
                }

                const unregister = task.cancellation.onCancelled(()=>{
            
                });
                try {
                    const onJson = (e:string)=> {
                        if (e) {
                            let val;
                            try {
                                val = JSON.parse(e);
                            } catch(e) {
                                logger.warn('json parse error in streamer', {device}, e);
                                return;
                            }
                            logger.debug('decoded from streamer', {device, json: val});
                            const target = this.currentStatus.currentStreams[device];
                            if (val.serial) {
                                target.serial = val.serial;
                            }
                            if (val.streamId) {
                                target.streamId = val.streamId;
                            }
                            if (val.streamSize) {
                                target.streamSize = val.streamSize;
                            }
                            if (val.frameSize) {
                                target.frameSize = val.frameSize;
                            } else {
                                target.frameSize = null;
                            }
                            if (val.subframe) {
                                target.subframe = val.subframe;
                            } else {
                                target.subframe = null;
                            }
                        }
                    }
                    const addr = this.indiManager.getIndiServerAddr();
                    await Pipe(task.cancellation,
                        {
                            command: ["./fitsviewer/streamer", addr.host, "" + addr.port, device, "CCD1"]
                        },
                        new MemoryStreams.ReadableStream(""),
                        onJson
                    );

                } finally {
                    unregister();
                    if (loopExposureTask) {
                        loopExposureTask?.cancel();
                        try {
                            await loopExposureTask
                        } catch(e) {
                            logger.info("Loop exposure task finished", e);
                        }
                    }
                }

            } finally {
                logger.debug('Streamer doing cleanup', {device});
                delete this.streamPromises[device];
                delete this.currentStatus.currentStreams[device];
            }
        });
    }

    stream = async (ct: CancellationToken, message: {loopExposure: boolean})=>{
        if (this.currentStatus.currentImagingSetup === null) {
            throw new Error("No imaging setup selected");
        }

        return await this.doStream(ct, this.currentStatus.currentImagingSetup, message.loopExposure);
    }

    shoot = async (ct: CancellationToken, message:{})=>{
        if (this.currentStatus.currentImagingSetup === null) {
            throw new Error("No imaging setup selected");
        }
        return await this.doShoot(ct, this.currentStatus.currentImagingSetup);
    }

    abort = async (ct: CancellationToken, message:{})=>{
        if (this.currentStatus.currentImagingSetup === null) {
            throw new Error("No imaging setup selected");
        }
        const {imagingSetupInstance, device} = this.resolveImagingSetup(this.currentStatus.currentImagingSetup);

        let sthCanceled = false;
        if (Object.prototype.hasOwnProperty.call(this.streamPromises, device)) {
            this.streamPromises[device].cancel();
            sthCanceled = true;
        }

        if (Object.prototype.hasOwnProperty.call(this.shootPromises, device)) {
            this.shootPromises[device].cancel();
            sthCanceled = true;
        }

        if (!sthCanceled) {
            throw new Error("Shoot not initiated on our side. Not aborting");
        }
    }

    getAPI() {
        return {
            shoot: this.shoot,
            stream: this.stream,
            abort: this.abort,
            setCurrentImagingSetup: this.setCurrentImagingSetup,
        }
    }
}
