'use strict';

const {IndiConnection, timestampToEpoch} = require('./Indi');
const Promises = require('./Promises');
const {IdGenerator} = require('./IdGenerator');
const ConfigStore = require('./ConfigStore');
const uuid = require('node-uuid');
const TraceError = require('trace-error');

class Camera {
    constructor(app, appStateManager, context) {
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
            list: ['21324564'],
            byuuid: {
                '21324564': {
                    // status are: idle/paused/error, running, done
                    status: 'idle',
                    errorMessage: null,
                    title: 'Test 1',
                    camera: null,
                    exposure: null,
                    iso: null,
                    bin: null,
                    steps: {
                        list: ['000001', '000002'],
                        byuuid:
                        {
                            'OOOOO1': {
                                count: 3,
                                type: 'Light'
                            },
                            'OOOOO2': {
                                count: 3,
                                expt: 30,
                                type: 'Light'
                            }
                        }
                    }
                }
            }
        });
        // Ensure no sequence is running on start

        // Device => promise
        this.shootPromises = {};
        this.currentStatus = this.appStateManager.getTarget().camera;
        this.context = context;
        this.indiManager = context.indiManager;
        this.imageProcessor = context.imageProcessor;

        this.imageIdGenerator = new IdGenerator();
        this.previousImages = {};
        
        this.currentSequenceUuid = undefined;
        this.currentSequencePromise = undefined;

        this.pauseRunningSequences();
        
        // Update available camera
        this.appStateManager.addSynchronizer(
            [
                'indiManager',
                    [
                        // Bind to driver_exec of each device
                        ['deviceTree', null, 'DRIVER_INFO', 'childs', 'DRIVER_EXEC', '$_'],
                        // Bind to driverToGroup mapping (any change)
                        ['driverToGroup',null]
                    ]
            ], this.updateAvailableCamera.bind(this), true);

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
        var found = {};
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
                    if (!"CONNECTION" in dtree) {
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

    updateAvailableCamera()
    {
        // List all cameras
        var indiManager = this.appStateManager.getTarget().indiManager;

        var availableDevices = [];
        for(var deviceId of Object.keys(indiManager.deviceTree).sort()) {
            var device = indiManager.deviceTree[deviceId];
            var driver;
            try {
                driver = device.DRIVER_INFO.childs.DRIVER_EXEC.$_;
            } catch(e) {
                continue;
            }

            if (indiManager.driverToGroup[driver] == 'CCDs') {
                console.log('got a ccd: ' + deviceId)
                availableDevices.push(deviceId);
            }
        }

        this.currentStatus.availableDevices = availableDevices;

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

    $api_setCamera(message, progress) {
        var self = this;
        return new Promises.Immediate((e)=> {
            console.log('Request to set device: ', JSON.stringify(message.data));
            if (self.currentStatus.availableDevices.indexOf(message.data.device) == -1) {
                throw "device not available";
            }
            self.currentStatus.selectedDevice = message.data.device;
        });
    }

    $api_setShootParam(message, progress) {
        var self = this;
        return new Promises.Immediate((e) => {
            // FIXME: send the corresponding info ?
            console.log('Request to set setting: ', JSON.stringify(message.data));
            var key = message.data.key;
            if (!Object.prototype.hasOwnProperty.call(self.currentStatus.currentSettings, key)) {
                throw "property not supported by device: " + key;
            }
            self.currentStatus.currentSettings[key] = message.data.value;
        });
    }

    $api_newSequence(message, progress) {
        var self = this;
        return new Promises.Immediate((e)=> {
            console.log('Request to create sequence: ', JSON.stringify(message.data));
            var key = uuid.v4();
            var firstSeq = uuid.v4();
            self.currentStatus.sequences.byuuid[key] = {
                status: 'idle',
                title: 'New sequence',
                camera: null,
                steps: {
                    list: [firstSeq],
                    byuuid: {
                        [firstSeq]: {
                            count:  1,
                            type:   'FRAME_LIGHT'
                        }
                    }
                }
            };
            self.currentStatus.sequences.list.push(key);
            return key;
        });
    }

    $api_newSequenceStep(message, progress) {
        var self = this;
        return new Promises.Immediate((e)=> {
            console.log('Request to add step: ', JSON.stringify(message));
            var sequenceUid = message.sequenceUid;
            var sequenceStepUid = uuid.v4();
            self.currentStatus.sequences.byuuid[sequenceUid].steps.byuuid[sequenceStepUid] = { count: 1, type: 'FRAME_LIGHT'};
            self.currentStatus.sequences.byuuid[sequenceUid].steps.list.push(sequenceStepUid);
            return sequenceStepUid;
        });
    }

    $api_deleteSequenceStep(message, progress) {
        var self = this;
        return new Promises.Immediate((e)=> {
            console.log('Request to drop step: ', JSON.stringify(message));
            var sequenceUid = message.sequenceUid;
            var sequenceStepUid = message.sequenceStepUid;
            var sequenceStepUidList = self.currentStatus.sequences.byuuid[sequenceUid].steps.list;
            var pos = sequenceStepUidList.indexOf(sequenceStepUid);
            if (pos == -1) {
                console.warn('step ' + sequenceStepUid + ' not found in ' + JSON.stringify(sequenceStepUidList));
                throw new Error("Step not found");
            }
            sequenceStepUidList.splice(pos, 1);
            delete self.currentStatus.sequences.byuuid[sequenceUid].steps.byuuid[sequenceStepUid];
            return sequenceStepUid;
        });

    }

    $api_moveSequenceSteps(message, progress) {
        var self = this;
        return new Promises.Immediate((e)=> {
            console.log('Request to move steps: ', JSON.stringify(message));
            var sequenceUid = message.sequenceUid;
            var sequenceStepUidList = message.sequenceStepUidList;
            // Check that no uid is lost
            var currentSequenceStepUidList = self.currentStatus.sequences.byuuid[sequenceUid].steps.list;
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
            self.currentStatus.sequences.byuuid[sequenceUid].steps.list = sequenceStepUidList;
        });
    }

    $api_updateSequenceParam(message, progress) {
        var self = this;
        return new Promises.Immediate((e)=> {
            console.log('Request to set setting: ', JSON.stringify(message));
            var key = message.sequenceUid;
            var param = message.param;
            var value = message.value;

            if ('sequenceStepUid' in message) {
                var sequenceStepUid = message.sequenceStepUid;
                self.currentStatus.sequences.byuuid[key].steps.byuuid[sequenceStepUid][param] = value;
            } else {
                self.currentStatus.sequences.byuuid[key][param] = value;
            }
        });
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

    startSequence(uuid) {
        var self = this;
        function getSequence() {
            var rslt = self.currentStatus.sequences.byuuid[uuid];
            if (!rslt) {
                throw new Error("Sequence removed: " + uuid);
            }
            return rslt;
        }

        function getNextStep() {
            var sequence = getSequence();
            var stepsUuid = sequence.steps.list;
            for(var i = 0; i < stepsUuid.length; ++i)
            {
                var stepUuid = stepsUuid[i];
                var step = sequence.steps.byuuid[stepUuid];
                if (!('done' in step)) {
                    step.done = 0;
                }
                if (step.done < step.count) {
                    return step;
                }
            }
            return undefined;
        }
        return new Promises.Loop(
                new Promises.Builder(()=> {
                    var sequence = getSequence();
                    console.log('Shoot in sequence:' + JSON.stringify(sequence));
                    var step = getNextStep();

                    if (step === undefined) {
                        console.log('Sequence terminated: ' + uuid);
                        return new Promises.Immediate((e) => {
                            // Break
                            return false;
                        });
                    }

                    var settings = Object.assign({}, sequence);
                    delete settings.steps;
                    delete settings.errorMessage;
                    settings = Object.assign(settings, step);
                    delete settings.count;
                    delete settings.done;
                    settings.prefix = settings.title + '_' + step.type + '_XXX';
                    var ditheringStep;
                    if (step.dither) {
                        // FIXME: no dithering for first shoot of sequence
                        console.log('Dithering required : ', Object.keys(self.context));
                        ditheringStep = self.context.phd.dither();
                    } else {
                        ditheringStep = new Promises.Immediate(()=>{});
                    }

                    return new Promises.Chain(
                        ditheringStep,
                        self.shoot(sequence.camera, ()=>(settings)),
                        new Promises.Immediate((e)=> {
                            step.done++;
                            return true;
                        })
                    );
                }), function(b) {
                    console.log('Sequencey Continue ? ', JSON.stringify(b));
                    return !b;
                }
            );
    }

    $api_startSequence(message, progress) {
        var self = this;
        return new Promises.Immediate((e)=> {
            console.log('Request to start sequence', JSON.stringify(message));
            var key = message.key;
            // Check no sequence is running ?
            if (self.currentSequencePromise != undefined) {
                throw new Error("A sequence is already running");
            }

            if (!self.currentStatus.sequences.byuuid[key]) {
                throw new Error("No sequence");
            }

            self.currentStatus.sequences.byuuid[key].status = 'running';
            self.currentStatus.sequences.byuuid[key].errorMessage = null;

            self.currentSequencePromise = self.startSequence(key);
            self.currentSequenceUuid = key;

            function finishWithStatus(s, e) {
                console.log('finishing with final status: ' + s);
                if (e) {
                    console.log('Error ' , e);
                }
                var seq = self.currentStatus.sequences.byuuid[key];
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
                self.currentSequenceUuid = null;
                self.currentSequencePromise = null;
            }

            self.currentSequencePromise.then((e) => finishWithStatus('done'));
            self.currentSequencePromise.onError((e) => finishWithStatus('error', e));
            self.currentSequencePromise.onCancel((e) => finishWithStatus('paused'));
            self.currentSequencePromise.start();
        });
    }

    $api_stopSequence(message, progress) {
        var self = this;
        return new Promises.Immediate((e)=> {
            console.log('Request to stop sequence', JSON.stringify(message));
            var key = message.key;
            if (self.currentSequenceUuid !== key) {
                throw new Error("Sequence " + key + " is not running");
            }
            
            self.currentSequencePromise.cancel();
        });
    }

    $api_resetSequence(message, progress) {
        var self = this;
        return new Promises.Immediate((e)=> {
            console.log('Request to reset sequence', JSON.stringify(message));
            var key = message.key;
            if (self.currentSequenceUuid === key) {
                throw new Error("Sequence " + key + " is running");
            }

            if (!Object.prototype.hasOwnProperty.call(self.currentStatus.sequences.byuuid, key)) {
                throw new Error("Sequence " + key + " not found");
            }

            const sequence = self.currentStatus.sequences.byuuid[key];

            sequence.status = 'idle';
            sequence.errorMessage = null;
            var stepsUuid = sequence.steps.list;
            for(var i = 0; i < stepsUuid.length; ++i)
            {
                var stepUuid = stepsUuid[i];
                var step = sequence.steps.byuuid[stepUuid];
                delete step.done;
            }
        });
    }

    $api_dropSequence(message, progress) {
        var self = this;
        return new Promises.Immediate((e)=> {
            console.log('Request to drop sequence', JSON.stringify(message));
            var key = message.key;
            if (self.currentSequenceUuid === key) {
                throw new Error("Sequence " + key + " is running");
            }
            let i;
            while((i = self.currentStatus.sequences.list.indexOf(key)) != -1) {
                self.currentStatus.sequences.list.splice(i, 1);
            }
            delete(self.currentStatus.sequences.byuuid[key]);
        });
    }

    getCropAdjustment(device)
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
                X: 0,
                Y: 0,
                WIDTH: Math.floor(max.w),
                HEIGHT: Math.floor(max.h)
            };
        }

        return {};
    }

    // Return a promise to shoot at the given camera (where)
    shoot(device, settingsProvider)
    {
        var connection;
        var self = this;
        var currentShootSettings;
        var ccdFilePathInitRevId;
        let shootResult = null;

        var result = new Promises.Chain(
            new Promises.Immediate(() => {
                if (Object.prototype.hasOwnProperty.call(self.currentStatus.currentShoots, device)) {
                    throw new Error("Shoot already started for " + device);
                }

                var settings = Object.assign({}, self.currentStatus.currentSettings);
                if (settingsProvider !== undefined) {
                    settings = settingsProvider(settings);
                }
                console.log('Shoot settings:' + JSON.stringify(settings, null, 2));
                self.currentStatus.currentShoots[device] = Object.assign({
                    status: 'init',
                    managed: true,
                    path: self.currentStatus.configuration.defaultImagePath || process.env.HOME,
                    prefix: self.currentStatus.configuration.defaultImagePrefix || 'IMAGE_XXX'
                }, settings);
                self.shootPromises[device] = result;
                currentShootSettings = self.currentStatus.currentShoots[device];
                console.log('Starting shoot: ' + JSON.stringify(currentShootSettings));
                var exposure = currentShootSettings.exposure;
                if (exposure === null || exposure === undefined) {
                    exposure = 0.1;
                }
                currentShootSettings.exposure = exposure;
            }),
            // Set the binning - if prop is present only
            new Promises.Conditional(() => (
                                currentShootSettings.bin !== null
                                && this.indiManager.getValidConnection().getDevice(device).getVector('CCD_BINNING').exists()),
                this.indiManager.setParam(device, 'CCD_BINNING',
                    () => ({
                        HOR_BIN: currentShootSettings.bin,
                        VER_BIN: currentShootSettings.bin}))),

            // Reset the frame size - if prop is present only
            new Promises.Conditional(()=> {
                                const dev = this.indiManager.getValidConnection().getDevice(device);
                                return Object.keys(this.getCropAdjustment(dev)).length;
                                },
                this.indiManager.setParam(device, 'CCD_FRAME', ()=>this.getCropAdjustment(this.indiManager.getValidConnection().getDevice(device)), true)),

            // Set the iso
            new Promises.Conditional(() => (
                                currentShootSettings.iso !== null
                                && this.indiManager.getValidConnection().getDevice(device).getVector('CCD_ISO').exists()),
                this.indiManager.setParam(device, 'CCD_ISO',
                    (vec) => {
                        vec = vec.getVectorInTree();
                        var v = currentShootSettings.iso;
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
                )
            ),
            this.indiManager.setParam(device, 'UPLOAD_SETTINGS',
                    (vec)=> {
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
                    }),
            // Set the upload mode to at least upload_client
            this.indiManager.setParam(device, 'UPLOAD_MODE',
                    (vec) => {
                        if (vec.getPropertyValueIfExists('UPLOAD_CLIENT') == 'On') {
                            console.log('want upload_client\n');
                            return {
                                UPLOAD_BOTH: 'On'
                            }
                        } else {
                            return ({});
                        }
                    }),

            this.indiManager.waitForVectors(device, ['CCD_FILE_PATH']),

            // Use a builder to ensure that connection is initialised when used
            new Promises.Builder(() => {
                connection = self.indiManager.connection;
                if (connection == undefined) {
                    throw "Indi server not connected";
                }

                ccdFilePathInitRevId = connection.getDevice(device).getVector("CCD_FILE_PATH").getRev();

                var expVector = connection.getDevice(device).getVector("CCD_EXPOSURE");

                expVector.setValues([{name: 'CCD_EXPOSURE_VALUE', value: currentShootSettings.exposure }]);

                var cancelFunction = () => {
                    // FIXME: we must wait, otherwise a new shoot can begin while these are still occuring.
                    var expVector = connection.getDevice(device).getVector("CCD_ABORT_EXPOSURE");
                    expVector.setValues([{name: 'ABORT', value: 'On'}]);
                    var uploadModeVector = connection.getDevice(device).getVector("UPLOAD_MODE");
                    uploadModeVector.setValues([{name: 'UPLOAD_CLIENT', value: 'On'}]);
                }
                // Make this uninterruptible
                return new Promises.Cancelator(cancelFunction, connection.wait(function() {
                    console.log('Waiting for exposure end');

                    var value = expVector.getPropertyValue("CCD_EXPOSURE_VALUE");
                    var state = expVector.getState();
                    if (value != "0") {
                        currentShootSettings.status = 'Exposing';
                    } else if (state == "Busy" && currentShootSettings.status == 'Exposing') {
                        currentShootSettings.status = 'Downloading';
                    }

                    if (state == "Busy") {
                        return false;
                    }
                    if (state != "Ok" && state != "Idle") {
                        throw "Exposure failed";
                    }

                    return (value == "0");
                }));
            }),
            new Promises.Immediate(function() {
                if (ccdFilePathInitRevId === connection.getDevice(device).getVector("CCD_FILE_PATH").getRev())
                {
                    throw new Error("CCD_FILE_PATH was not updated");
                }

                var value = connection.getDevice(device).getVector("CCD_FILE_PATH").getPropertyValue("FILE_PATH");

                console.log('Finished  image acquisistion :', value);

                if (self.currentStatus.configuration.fakeImages != null) {
                    var examples = self.currentStatus.configuration.fakeImages;
                    value = examples[Math.floor(Math.random() * examples.length)];
                    if (self.currentStatus.configuration.fakeImagePath != null) {
                        value = self.currentStatus.configuration.fakeImagePath + value;
                    }
                    console.log('Using fake image : ' + value);
                }

                var newUuid = self.imageIdGenerator.next();

                self.currentStatus.images.list.push(newUuid);
                self.currentStatus.images.byuuid[newUuid] = {
                    path: value,
                    device: device
                };
                shootResult = ({path: value});
            }),

            // Remove UPLOAD_MODE
            // FIXME: this is a finally !
            this.indiManager.setParam(device, 'UPLOAD_MODE',
                    (vec) => {
                        if (vec.getPropertyValueIfExists('UPLOAD_CLIENT') != 'On') {
                            console.log('set back upload_client\n');
                            return {
                                UPLOAD_CLIENT: 'On'
                            }
                        } else {
                            return ({});
                        }
                    }),
            new Promises.Immediate(function() {
                return shootResult;
            })
        );

        var cleanup = () => {
            console.log('Doing cleanup');
            if (self.shootPromises[device] === result) {
                delete self.shootPromises[device];
                delete self.currentStatus.currentShoots[device];
            }
            currentShootSettings = undefined;
        }
        result.onCancel(cleanup);
        result.onError(cleanup);
        result.then(cleanup);

        return result;
    }

    $api_shoot(message, progress) {
        var self = this;
        
        return this.shoot(this.currentStatus.selectedDevice);
    }

    $api_abort(message, progress) {
        return new Promises.Immediate(() => {
            var currentDevice = this.currentStatus.selectedDevice;
            if (currentDevice === null) throw new Error("No device selected");
            if (Object.prototype.hasOwnProperty.call(this.shootPromises, currentDevice)) {
                this.shootPromises[currentDevice].cancel();
            } else {
                // FIXME: be more aggressive about abort !
                throw new Error("Shoot not initiated on our side. Not aborting");
            }
        });
    }

}

module.exports = {Camera}