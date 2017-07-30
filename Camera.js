'use strict';

const {IndiConnection} = require('./Indi');
const Promises = require('./Promises');

class Camera {
    constructor(app, appStateManager, indiManager) {
        this.appStateManager = appStateManager;
        this.appStateManager.getTarget().camera = {
            status: "idle"
        }

        this.currentStatus = this.appStateManager.getTarget().camera;
        this.indiManager = indiManager;

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