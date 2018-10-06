'use strict';

const Obj = require('./Obj.js');
const Promises = require('./Promises');
const ConfigStore = require('./ConfigStore');
const JsonProxy = require('./JsonProxy');

class Focuser {
    constructor(app, appStateManager, context)
    {
        this.appStateManager = appStateManager;
        this.appStateManager.getTarget().focuser = {
            selectedDevice: null,
            preferedDevice: null,
            availableDevices: [],

            currentSettings: {
                range: 1000,
                steps: 5,
                backlash: 200
            },

            current: {
                status: 'idle',
                error: null,
                // position => details
                minSte: 0,
                maxStep: 10000,
                points: {
                    "5000": {
                        fwhm: 2.9
                    },
                    "6000": {
                        fwhm: 2.7
                    },
                    "7000": {
                        fwhm: 2.5
                    },
                    "8000": {
                        fwhm: 2.6
                    },
                    "9000": {
                        fwhm: 2.8
                    }
                },
                targetStep: 3000
            }
        };
        this.currentStatus = this.appStateManager.getTarget().focuser;
        this.resetCurrent('idle');
        this.camera = context.camera;
        this.indiManager = context.indiManager;
        this.imageProcessor = context.imageProcessor;

    }

    resetCurrent(status)
    {
        this.currentStatus.current = {
            status: status,
            error: null,
            minStep: null,
            maxStep: null,
            targetStep: null,
            points: {}
        }
    }

    setCurrentStatus(status, error)
    {
        this.currentStatus.current.status = status;
        if (error) {
            this.currentStatus.current.error = '' + (error.message || error);
        }
    }

    // Adjust the focus
    focus(shootDevice, focusSetting) {
        var self = this;
        let focuserId;

        let firstStep, lastStep, currentStep, stepId, stepSize;
        const amplitude = this.currentStatus.currentSettings.range;
        const stepCount = this.currentStatus.currentSettings.steps;
        const data = [];
        
        function moveFocuser(valueGenerator) {
            return new Promises.Builder(()=> {
                return self.indiManager.setParam(focuserId, 'ABS_FOCUS_POSITION', {
                    FOCUS_ABSOLUTE_POSITION: valueGenerator()
                });
            });
        }

        return new Promises.Chain(
            new Promises.Builder(()=> {
                // Find a focuser.
                const connection = self.indiManager.getValidConnection();
                const availableFocusers = connection.getAvailableDeviceIds(['ABS_FOCUS_POSITION']);
                availableFocusers.sort();
                if (availableFocusers.length == 0) {
                    throw new Error("No focuser available");
                }
                focuserId = availableFocusers[0];

                // Move to the starting point
                const focuser = self.indiManager.getValidConnection().getDevice(focuserId);
                const absPos = focuser.getVector('ABS_FOCUS_POSITION');
                if (!absPos.isReadyForOrder()) {
                    throw new Error("Focuser is not ready");
                }
                const start = parseFloat(absPos.getPropertyValue("FOCUS_ABSOLUTE_POSITION"));
                console.log('current pos is ' + start);
                firstStep = start - amplitude;
                lastStep = start + amplitude;
                stepSize = 2 * amplitude / stepCount;

                

                if (firstStep < 0) {
                    firstStep = 0;
                }
                self.currentStatus.current.firstStep = firstStep;
                self.currentStatus.current.lastStep = lastStep;

                currentStep = firstStep;
                stepId = 0;
                return null;
            }),
            new Promises.Loop(
                // Move to currentStep
                new Promises.Chain(
                    moveFocuser(()=>currentStep),
                    
                    new Promises.Builder(()=> {
                        return self.camera.shoot(shootDevice);
                    }),

                    new Promises.Builder((imagePath)=> {
                        return self.imageProcessor.compute({
                            "starField":{ "source": { "path": imagePath.path}}
                        });
                    }),
                    // move on or stop
                    new Promises.Immediate((starField)=> {
                        console.log('StarField', JSON.stringify(starField, null, 2));
                        let fwhm;
                        if (starField.length) {
                            for(let star of starField) {
                                fwhm += star.fwhm;
                            }
                            fwhm /= starField.length;

                        } else {
                            // Testing...
                            // if (Math.random() < 0.2) {
                            //     fwhm = null;
                            // } else {
                            //     fwhm = Math.random() * 3 + 3;
                            // }
                            fwhm = null;
                        }

                        if (fwhm !== null) {
                            data.push( [currentStep, fwhm ]);
                        }

                        self.currentStatus.current.points[currentStep] = {
                            fwhm: fwhm
                        };
                        currentStep += stepSize;
                        stepId++;
                    })
                ),
                function() {
                    return currentStep > lastStep;
                }
            ),
            new Promises.Builder(()=> {
                if (data.length < 5) {
                    // FIXME: move the focuser back to its original pos
                    throw new Error("Not enough data for focus");
                }
                const result = regression.polynomial(data, {order: 4});
                // This is ugly. but works
                const precision = 50;
                let bestValue = undefined;
                let bestPos = undefined;
                for(let i = 0; i <= precision; ++i) {
                    const pos = firstStep + i * (lastStep - firstStep) / precision;
                    const valueAtPos = result.predic(pos)
                    if (i === 0 || bestValue > valueAtPos) {
                        bestValue = valueAtPos;
                        bestPos = pos;
                    }
                }
                console.log('Found best position at ' + bestPos);
                let backlashed = bestPos - self.currentStatus.currentSettings.backlash;
                if (backlashed < firstStep) {
                    backlashed = firstStep;
                }
                if (backlashed != bestPos) {
                    return new Promises.Chain(
                            moveFocuser(()=>backlashed),
                            moveFocuser(()=>bestPos));
                } else {
                    return moveFocuser(bestPos);
                }
            })
        );
    }

    $api_updateCurrentSettings(message, progress)
    {
        return new Promises.Immediate(() => {
            const newSettings = JsonProxy.applyDiff(this.currentStatus.currentSettings, message.diff);
            // FIXME: do the checking !
            this.currentStatus.currentSettings = newSettings;
        });
    }

    $api_focus(message, progress) {
        console.log('API focus called');
        var self = this;
        
        return new Promises.Builder(function() {
                // FIXME: check a promise is not already running
                self.resetCurrent('running');

                const ret = self.focus(self.camera.currentStatus.selectedDevice);
                ret.then(()=>self.setCurrentStatus('done', null));
                ret.onError((e)=>self.setCurrentStatus('error', e));
                ret.onCancel((e)=>self.setCurrentStatus('interrupted', e));
                return ret;
            });

    }
}

module.exports = {Focuser}
