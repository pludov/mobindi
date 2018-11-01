'use strict';

const PolynomialRegression = require('ml-regression-polynomial');
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
                backlash: 200,
                lowestFirst: false,
                targetCurrentPos: true,
                targetPos: 10000
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
                predicted: {
                },
                targetStep: 3000
            }
        };
        this.currentStatus = this.appStateManager.getTarget().focuser;
        this.currentPromise = null;
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
            points: {},
            predicted: {}
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

        let initialPos;
        let lastKnownPos;
        let firstStep, lastStep, currentStep, stepId, stepSize, moveForward;
        const amplitude = this.currentStatus.currentSettings.range;
        const stepCount = this.currentStatus.currentSettings.steps;
        const data = [];
        
        function moveFocuser(valueGenerator) {
            return new Promises.Builder(()=> {
                const target = valueGenerator();
                
                const backlash = self.currentStatus.currentSettings.backlash;
                let intermediate = undefined;
                if (backlash != 0) {
                    if (moveForward) {
                        // Need backlash clearance in this direction
                        if (target < lastKnownPos) {
                            intermediate = target - backlash;
                        }
                    } else {
                        if (target > lastKnownPos) {
                            intermediate = target + backlash;
                        }
                    }
                    if (intermediate < 0) {
                        intermediate = 0;
                    }
                    // FIXME: check upper bound
                }
                lastKnownPos = target;
                console.log('AUTOFOCUS: moving focuser to ' + target);
                if ((intermediate !== undefined) && (intermediate !== target)) {
                    // Account for backlash
                    console.log('Focuser moving with backlash to : ', intermediate, target);
                    return new Promises.Chain(
                        self.indiManager.setParam(focuserId, 'ABS_FOCUS_POSITION', {
                            FOCUS_ABSOLUTE_POSITION: intermediate
                        }),
                        self.indiManager.setParam(focuserId, 'ABS_FOCUS_POSITION', {
                            FOCUS_ABSOLUTE_POSITION: target
                        })
                    );
                } else {
                    // Direct move
                    console.log('Focuser moving to : ', target);
                    return self.indiManager.setParam(focuserId, 'ABS_FOCUS_POSITION', {
                        FOCUS_ABSOLUTE_POSITION: target
                    });
                }
            });
        }

        function nextStep() {
            return currentStep + (moveForward ? stepSize : -stepSize);
        }

        function done(step) {
            return moveForward ? step > lastStep : step < lastStep
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

                initialPos = parseFloat(absPos.getPropertyValue("FOCUS_ABSOLUTE_POSITION"));
                lastKnownPos = initialPos;
                const start = this.currentStatus.currentSettings.targetCurrentPos
                        ? lastKnownPos
                        : this.currentStatus.currentSettings.targetPos;

                console.log('start pos is ' + start);
                firstStep = start - amplitude;
                lastStep = start + amplitude;
                stepSize = 2 * amplitude / stepCount;


                if (firstStep < 0) {
                    firstStep = 0;
                }
                // FIXME: check lastStep < focuser max

                moveForward = self.currentStatus.currentSettings.lowestFirst;
                // Negative focus swap steps
                if (!moveForward) {
                    const tmp = lastStep;
                    lastStep = firstStep;
                    firstStep = tmp;
                }

                self.currentStatus.current.firstStep = firstStep;
                self.currentStatus.current.lastStep = lastStep;

                currentStep = firstStep;
                stepId = 0;
                return null;
            }),
            moveFocuser(()=>currentStep),
            new Promises.Loop(
                // Move to currentStep
                new Promises.Chain(
                    new Promises.Builder(()=> {
                        console.log('AUTOFOCUS: shoot start');
                        return self.camera.shoot(shootDevice, ()=>({ prefix: 'focus_ISO8601_step_' + Math.floor(currentStep) }));
                    }),

                    new Promises.Concurrent(
                        new Promises.Chain(
                            new Promises.Builder((imagePath)=> {
                                console.log('AUTOFOCUS: compute');
                                return self.imageProcessor.compute({
                                    "starField":{ "source": { "path": imagePath.path}}
                                });
                            }),
                            new Promises.Immediate((starField)=> {
                                console.log('AUTOFOCUS: got starfield');
                                console.log('StarField', JSON.stringify(starField, null, 2));
                                let fwhm;
                                if (starField.length) {
                                    for(let star of starField) {
                                        fwhm += star.fwhm;
                                    }
                                    fwhm /= starField.length;

                                } else {
                                    fwhm = null;
                                    // Testing...
                                    // if (Math.random() < 0.2) {
                                    //     fwhm = null;
                                    // } else {
                                    //     fwhm = Math.random() * 3 + 3;
                                    // }
                                }

                                if (fwhm !== null) {
                                    data.push( [currentStep, fwhm ]);
                                }

                                self.currentStatus.current.points[currentStep] = {
                                    fwhm: fwhm
                                };
                            })
                        ),
                        moveFocuser(()=>(done(nextStep()) ? currentStep : nextStep()))
                    ),

                    new Promises.Immediate(()=> {
                        currentStep = nextStep();
                        console.log('AUTOFOCUS: next step - ' + currentStep);
                        stepId++;
                    })
                ),
                function() {
                    return done(currentStep);
                }
            ),
            new Promises.Builder(()=> {
                let bestPos = undefined;
                let error = undefined;
                if (data.length < 5) {
                    bestPos = initialPos;
                    // FIXME: move the focuser back to its original pos
                    error = new Error("Not enough data for focus");
                    console.log('Could not find best position. Moving back to origin');
                } else {
                    console.log('regression with :' + JSON.stringify(data));
                    const result = new PolynomialRegression(data.map(e=>e[0]), data.map(e=>e[1]), 4);
                    // This is ugly. but works
                    const precision = Math.ceil(stepSize / 7);
                    let bestValue = undefined;
                    for(let i = 0; i <= precision; ++i) {
                        const pos = firstStep + i * (lastStep - firstStep) / precision;
                        const pred = result.predict(pos);
                        console.log('predict: '  + JSON.stringify(pred));
                        const valueAtPos = pred;
                        self.currentStatus.current.predicted[pos] = {
                            fwhm: valueAtPos
                        };
                        if (i === 0 || bestValue > valueAtPos) {
                            bestValue = valueAtPos;
                            bestPos = pos;
                        }
                    }
                    console.log('Found best position at ' + bestPos);
                }
                return new Promises.Chain(
                    moveFocuser(()=>bestPos),
                    new Promises.Immediate(()=> {
                        if (error !== undefined) {
                            throw error;
                        }
                        return bestPos;
                    })
                );
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

        const result = new Promises.Builder(function() {
                if (self.currentPromise !== null) {
                    throw new Error("Focus already started");
                }
                self.currentPromise = result;
                self.resetCurrent('running');

                const ret = self.focus(self.camera.currentStatus.selectedDevice);
                ret.then(()=>{
                    if (self.currentPromise === result) {
                        self.currentPromise = null;
                    }
                    self.setCurrentStatus('done', null)
                });
                ret.onError((e)=>{
                    if (self.currentPromise === result) {
                        self.currentPromise = null;
                    }
                    self.setCurrentStatus('error', e);
                });
                ret.onCancel((e)=>{
                    if (self.currentPromise === result) {
                        self.currentPromise = null;
                    }
                    self.setCurrentStatus('interrupted', e);
                });
                return ret;
            });
        return result;

    }

    $api_abort(message, progress) {
        return new Promises.Immediate(() => {
            if (this.currentPromise !== null) {
                this.currentPromise.cancel();
            }
        });
    }
}

module.exports = {Focuser}
