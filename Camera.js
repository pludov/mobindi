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

    shoot(message, reply) {
        var self = this;
        if (this.indiManager.connection == undefined) {
            reply({result: 'error', message: 'indi server not connected'});
        } else {
            var connection = this.indiManager.connection;
            var dev = self.indiManager.connection.getDevice(message.data.dev);

            var process = new Promises.Chain(
                new Promises.Cancelable(function(next) {
                    dev.setVectorValues('CCD_EXPOSURE', [{name: 'CCD_EXPOSURE_VALUE', value: 5 }]);

                    next.done();
                }),

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
                }),
                new Promises.Cancelable(function(next) {
                    next.done(dev.getPropertyValue("CCD_FILE_PATH", "FILE_PATH"));
                }));

            process.then((rslt) => {
                reply({status: 'ok', path: rslt});
            })
                .onError((a) => { reply({status: 'error', error: '' + a})})
                .onCancel((a)=> { reply({status: 'canceled'})});

            process.start();
        }
    }
}

module.exports = {Camera}