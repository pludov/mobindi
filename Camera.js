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

            // Describe each setting of the camera.
            currentSettingDesc: {
                bin: {
                    available: true,
                    title: 'bin',
                    values: [1, 2, 4]
                },

                exp: {
                    available: true,
                    title: 'exposure',
                    min: 0.01,
                    max: 600,
                    values: [0.01, 0.5, 1, 1.5, 2, 3, 5, 10, 20, 30, 60],
                },

                iso: {
                    available: true,
                    title: 'iso',
                    values: [100, 200, 400, 800, 1600, "auto"]
                }
            }
        }

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

    $api_shoot(message, progress) {
        var self = this;
        var connection;
        var dev;

        return new Promises.Chain(

            new Promises.Immediate(function() {
                connection = self.indiManager.connection;
                if (connection == undefined) {
                    throw "Indi server not connected";
                }
                dev = connection.getDevice(message.data.dev);

                dev.setVectorValues('CCD_EXPOSURE', [{name: 'CCD_EXPOSURE_VALUE', value: 5 }]);
            }),

            // Use a builder to ensure that connection is initialised when used
            new Promises.Builder(() => (
                connection.wait(function() {
                    console.log('Waiting for exposure end');
                    var vector = dev.getVector("CCD_EXPOSURE");
                    if (vector == null) {
                        throw "CCD_EXPOSURE disappeared";
                    }

                    if (vector.$state == "Busy") {
                        return false;
                    }

                    var value = dev.getProperty("CCD_EXPOSURE", "CCD_EXPOSURE_VALUE");
                    if (value == null) {
                        throw "CCD_EXPOSURE_VALUE disappered";
                    }

                    return (value.$_ == 0);
                }))),

            new Promises.Immediate(function() {
                return ({path: dev.getPropertyValue("CCD_FILE_PATH", "FILE_PATH")});
            })
        );
    }
}

module.exports = {Camera}