'use strict';

const {IndiConnection} = require('./Indi');
const Promises = require('./Promises');

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

            }
        }
        // Device => promise
        this.shootPromises = {};
        this.currentStatus = this.appStateManager.getTarget().camera;
        this.indiManager = indiManager;

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


    // Return a promise to shoot at the given camera (where)
    shoot(device)
    {
        var connection;
        var self = this;
        var currentShootSettings;

        var result = new Promises.Chain(
            new Promises.Immediate(() => {
                if (Object.prototype.hasOwnProperty.call(self.shootPromises, device)) {
                    throw new Error("Shoot already started for " + device);
                }
                self.currentStatus.currentShoots[device] = Object.assign({status: 'init'}, self.currentStatus.currentSettings);
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
                var expVector = connection.getDevice(device).getVector("CCD_EXPOSURE");

                expVector.setValues([{name: 'CCD_EXPOSURE_VALUE', value: currentShootSettings.exp }]);

                return connection.wait(function() {
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
                })
            }),

            new Promises.Immediate(function() {
                return ({path: connection.getDevice(device).getVector("CCD_FILE_PATH").getPropertyValue("FILE_PATH")});
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