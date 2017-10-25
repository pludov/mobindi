'use strict';

const {IndiConnection} = require('./Indi');
const Promises = require('./Promises');
const {IdGenerator} = require('./IdGenerator');
const ConfigStore = require('./ConfigStore');
const uuid = require('node-uuid');

class Camera {
    constructor(app, appStateManager, indiManager) {
        this.appStateManager = appStateManager;
        this.appStateManager.getTarget().camera = {
            status: "idle",
            selectedDevice: null,
            preferedDevice: null,
            availableDevices: [],

            // The settings, some may not be available
            currentSettings: {
                bin: 1,
                exp: 1.0,
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
                list: ['aaaa'],
                byuuid: {
                    'aaaa':
                    {
                        // status are: idle/paused/error, running, done
                        status: 'idle',
                        title: 'Test 1',
                        camera: null,
                        settings: {
                            bin:    1,
                            exp:    60,
                            iso:    1600
                        },
                        steps: {
                            list: ['000001', '000002'],
                            byuuid: 
                            {
                                'OOOOO1': {
                                    count:  3,
                                    type:   'Light'
                                },
                                'OOOOO2': {
                                    count:  3,
                                    expt:   30,
                                    type:   'Light'
                                }
                            }
                        }
                    }
                }
            },
            configuration: {}
        };

        new ConfigStore(appStateManager, 'camera', ['camera', 'configuration'], {
            fakeImagePath: null,
            fakeImages: null
        }, {
            fakeImagePath: "/home/ludovic/Astronomie/home/photos/2015/2015-08-09/photos/2015-08-09/",
            fakeImages: [
                    "Single_Bin1x1_1s_2015-08-09_23-40-17.fit",  "Single_Bin1x1_1s_2015-08-09_23-44-44.fit",  "Single_Bin1x1_30s_2015-08-09_23-47-04.fit",  "Single_Bin2x2_2s_2015-08-09_23-28-37.fit",      "Single_M27_Bin1x1_2s_2015-08-10_03-40-12.fit",
                    "Single_Bin1x1_1s_2015-08-09_23-41-16.fit",  "Single_Bin1x1_30s_2015-08-09_23-42-37.fit",  "Single_Bin1x1_5s_2015-08-09_23-41-47.fit",   "Single_Bin2x2_2s_2015-08-09_23-29-41.fit",      "Single_M27_G_Bin1x1_2s_2015-08-10_03-46-49.fit",
                    "Single_Bin1x1_1s_2015-08-09_23-44-21.fit",  "Single_Bin1x1_30s_2015-08-09_23-45-37.fit",  "Single_Bin2x2_2s_2015-08-09_23-27-56.fit",   "Single_M27_Bin1x1_1s_2015-08-10_03-39-51.fit"
            ]
        });
        // Device => promise
        this.shootPromises = {};
        this.currentStatus = this.appStateManager.getTarget().camera;
        this.indiManager = indiManager;

        this.imageIdGenerator = new IdGenerator();
        this.previousImages = {};
        
        this.currentSequenceUuid = undefined;
        this.currentSequencePromise = undefined;


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
        for(var device of this.currentStatus.availableDevices)
        {
            var rev, value;
            try {
                rev = indiManager.deviceTree[device].CCD_FILE_PATH.$rev;
                value = indiManager.deviceTree[device].CCD_FILE_PATH.childs.FILE_PATH.$_;

            } catch(e) {
                console.log('Error with device ' + device, e);
                continue;
            }

            var stamp = rev + ":" + value;
            if (!Object.prototype.hasOwnProperty.call(this.previousImages, device))
            {
                this.previousImages[device] = stamp;
            } else {
                if (this.previousImages[device] != stamp) {
                    this.previousImages[device] = stamp;
                    if (value != '') {

                        var currentShoot;
                        if (Object.prototype.hasOwnProperty.call(this.currentStatus.currentShoots, device)) {
                            currentShoot = this.currentStatus.currentShoots[device];
                        } else {
                            currentShoot = undefined;
                        }
                        if (currentShoot != undefined && currentShoot.type == 'managed') {
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
            var status, exp;
            try {
                status = device.CCD_EXPOSURE.$state;
                exp = device.CCD_EXPOSURE.childs.CCD_EXPOSURE_VALUE.$_;
                exp = parseFloat(exp);
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

            if (status == 'Busy' && exp > 0) {
                // Create a shoot
                if (currentShoot === undefined) {
                    currentShoot= {
                        exp: exp,
                        expLeft: exp,
                        type: 'external'
                    };
                    this.currentStatus.currentShoots[deviceId] = currentShoot;
                } else {
                    if (exp > 0 || currentShoot.expLeft) {
                        currentShoot.expLeft = exp;
                    }
                    if (exp > currentShoot.exp) {
                        currentShoot.exp = exp;
                    }
                }
            } else {
                // Destroy the shoot, if not managed
                if (currentShoot !== undefined) {
                    if (currentShoot.type == 'managed') {
                        if (status !== 'Busy') exp = 0;
                        if (exp > 0 || currentShoot.expLeft) {
                            currentShoot.expLeft = exp;
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
                settings: {
                    bin:    null,
                    exp:    null,
                    iso:    null
                },
                steps: {
                    list: [firstSeq],
                    byuuid: {
                        [firstSeq]: {
                            count:  1,
                            type:   'Light'
                        }
                    }
                }
            };
            self.currentStatus.sequences.list.push(key);
            return key;
        });
    }

    $api_updateSequenceParam(message, progress) {
        var self = this;
        return new Promises.Immediate((e)=> {
            console.log('Request to set setting: ', JSON.stringify(message.data));
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
    
    startSequence(uuid) {
        return new Promises.Sleep(5000);
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

            self.currentSequencePromise = self.startSequence(key);
            self.currentSequenceUuid = key;

            function finishWithStatus(s) {
                console.log('finishing with final status: ' + s);
                self.currentStatus.sequences.byuuid[key].status = s;
                self.currentSequenceUuid = null;
                self.currentSequencePromise = null;
            }

            self.currentSequencePromise.then((e) => finishWithStatus('done'));
            self.currentSequencePromise.onError((e) => finishWithStatus('error'));
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

    // Return a promise to shoot at the given camera (where)
    shoot(device)
    {
        var connection;
        var self = this;
        var currentShootSettings;
        var ccdFilePathInitRevId;

        var result = new Promises.Chain(
            new Promises.Immediate(() => {
                if (Object.prototype.hasOwnProperty.call(self.currentStatus.currentShoots, device)) {
                    throw new Error("Shoot already started for " + device);
                }
                self.currentStatus.currentShoots[device] = Object.assign({
                    status: 'init',
                    type:'managed'
                }, self.currentStatus.currentSettings);
                self.shootPromises[device] = result;
                currentShootSettings = self.currentStatus.currentShoots[device];
            }),
            // Set the binning - if prop is present only
            new Promises.Conditional(() => (
                                currentShootSettings.bin !== null
                                && this.indiManager.getValidConnection().getDevice(device).getVector('CCD_BINNING').exists()),
                this.indiManager.setParam(device, 'CCD_BINNING',
                    () => ({
                        HOR_BIN: currentShootSettings.bin,
                        VER_BIN: currentShootSettings.bin}))),
            // Set the iso
            new Promises.Conditional(() => (
                                currentShootSettings.iso !== null
                                && this.indiManager.getValidConnection().getDevice(device).getVector('CCD_ISO').exists()),
                this.indiManager.setParam(device, 'CCD_ISO',
                    (vec) => {
                        vec = vec.getVectorInTree();
                        var v = currentShootSettings.iso;
                        var childToSet = undefined;
                        console.log('WTF vec is ' + JSON.stringify(vec));
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

            // Use a builder to ensure that connection is initialised when used
            new Promises.Builder(() => {
                connection = self.indiManager.connection;
                if (connection == undefined) {
                    throw "Indi server not connected";
                }

                ccdFilePathInitRevId = connection.getDevice(device).getVector("CCD_FILE_PATH").getRev();

                var expVector = connection.getDevice(device).getVector("CCD_EXPOSURE");

                expVector.setValues([{name: 'CCD_EXPOSURE_VALUE', value: currentShootSettings.exp }]);

                var cancelFunction = () => {
                    var expVector = connection.getDevice(device).getVector("CCD_ABORT_EXPOSURE");
                    expVector.setValues([{name: 'ABORT', value: 'On'}]);
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

                return ({path: value});
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