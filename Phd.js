'use strict';

const net = require('net');
const Promises = require('./Promises');

class Phd {
    constructor(app, updateStatus)
    {
        this.updateStatus = updateStatus;

        this.running = true;
        this.currentStatus = {
            // Connecting
            phd_started: false,

            connected: false,

            AppState: "NotConnected"
        };
        // Cet objet contient les dernier guide step
        this.steps = {};
        this.stepId = 0;

        this.updateStepsStats();

        this.updateStatus();
        this.lifeCycle().start();
    }


    lifeCycle() {
        var self = this;
        return (
            new Promises.Loop(
                new Promises.Chain(
                    new Promises.Cancelable(function(next) {
                        self.stepUid = 0;
                        self.clientData = "";
                        self.client = new net.Socket();

                        self.client.on('data', function(data) {
                            console.log('Received: ' + data);
                            self.clientData += data;
                            self.flushClientData();
                        });
                        self.client.on('error', function(e) {
                            console.log('Phd socket error', e);
                        });

                        self.client.on('close', function() {
                            console.log('Phd connection closed');
                            self.client = undefined;

                            // FIXME: flushing these messages can lead to change (including reconnection ?)
                            self.flushClientData();

                            self.currentStatus.star = null;
                            self.currentStatus.AppState = "NotConnected";
                            self.steps = {};
                            self.stepId = 0;

                            self.updateStatus();

                            if (next.isActive()) {
                                next.done();
                            }
                        });

                        self.client.connect(4400, '127.0.0.1', function() {
                            console.log('Connected to phd');
                        });

                        self.updateStatus();
                    }, function(next) {
                        if (self.client != undefined) {
                            try {
                                self.client.close();
                            } catch(e) {
                                console.log('Failed to close', e);
                            }
                        }
                    }),
                    new Promises.Sleep(1000)
                )
            )).then(() => { throw new Error("Lifecycle must not stop!")});
    }

    stepIdToUid(stepId)
    {
        var uid = ("000000000000000" + stepId.toString(16)).substr(-16);
        return uid;
    }

    updateStepsStats()
    {
        // calcul RMS et RMS ad/dec
        var rms = [0, 0];
        var count = 0;
        var keys = ['RADistanceRaw', 'DECDistanceRaw']
        var log = [];
        var vals = [0, 0];
        var maxs = [0, 0, 0];
        Outer: for(var uid in this.steps)
        {
            var step = this.steps[uid];

            for(var i = 0; i < keys.length; ++i)
            {
                var key = keys[i];
                if (key in step && step[key] != null) {
                    vals[i] = step[key];
                } else {
                    continue Outer;
                }
            }

            var dst2 = 0;
            for(var i = 0; i < keys.length; ++i) {
                var v = vals[i];
                if (Math.abs(v) > maxs[i]) {
                    maxs[i] = Math.abs(v);
                }
                var v2 = v * v;
                dst2 += v2;
                rms[i] += v2;
            }
            if (dst2 > maxs[2]) {
                maxs[2] = dst2;
            }
            count++;
        }

        maxs[2] = Math.sqrt(maxs[2]);

        function calcRms(sqr, div)
        {
            if (div == 0) {
                return null;
            }
            return Math.sqrt(sqr / div);
        }

        this.currentStatus.RADistanceRMS = calcRms(rms[0], count);
        this.currentStatus.DECDistanceRMS = calcRms(rms[1], count);
        this.currentStatus.RADECDistanceRMS = calcRms(rms[0] + rms[1], count);

        function calcPeak(val, div)
        {
            if (div == 0) {
                return null;
            }
            return val;
        }
        this.currentStatus.RADistancePeak = calcPeak(maxs[0], count);
        this.currentStatus.DECDistancePeak = calcPeak(maxs[1], count);
        this.currentStatus.RADECDistancePeak = calcPeak(maxs[2], count);
    }
    flushClientData()
    {
        var self = this;
        // FIXME: consume datas.
        var cutAt;
        while((cutAt = this.clientData.indexOf("\r\n")) != -1)
        {
            var data = this.clientData.substr(0, cutAt);
            this.clientData = this.clientData.substr(cutAt + 2);
            console.log('received json : ' + data);
            var statusUpdated = false;
            try {
                var event = JSON.parse(data);

                if ("Event" in event) {
                    var eventToStatus = {
                        "GuideStep":                "Guiding",
                        "Paused":                   "Paused",
                        "StartCalibration":         "Calibrating",
                        "LoopingExposures":         "Looping",
                        "LoopingExposuresStopped":  "Stopped",
                        "StarLost":                 "LostLock"
                    };
                    switch (event.Event) {
                        case "AppState":
                            self.currentStatus.connected = true;
                            self.currentStatus.AppState = event.State;
                            self.currentStatus.star = null;
                            console.log('Initial status:' + self.currentStatus.AppState);
                            statusUpdated = true;
                            break;
                        default:
                            if (event.Event in eventToStatus) {
                                var newStatus = eventToStatus[event.Event];
                                if (self.currentStatus.AppState != newStatus) {
                                    self.currentStatus.star = null;
                                    self.currentStatus.AppState = newStatus;
                                    self.steps = {};
                                    self.stepId = 0;
                                    self.updateStepsStats();
                                    console.log('New status:' + self.currentStatus.AppState);
                                    statusUpdated = true;
                                }

                            }
                    };
                    if (event.Event == "GuideStep") {
                        self.currentStatus.star = {
                            SNR: event.SNR,
                            StarMass: event.StarMass
                        };


                        var simpleEvent = Object.assign({}, event);
                        delete simpleEvent.Event;
                        delete simpleEvent.Host;
                        delete simpleEvent.Inst;
                        delete simpleEvent.Mount;

                        self.stepId++;
                        if (self.stepId > 100) {
                            delete self.steps[self.stepIdToUid(self.stepId - 100)];
                        }
                        self.steps[self.stepIdToUid(self.stepId)] = simpleEvent;
                        self.updateStepsStats();

                        statusUpdated = true;
                    }
                }
            }catch(e) {
                console.log('Error: ' + e);
            }
            if (statusUpdated) {
                self.updateStatus();
            }
        }
    }

    getStatus(req, res, next)
    {
        res.jsonResult = this.currentStatus;
        next();
    }

    reqGuide(order, next) {
        if (this.client == undefined) {

        }
    }

    whenConnected(data, reply, func) {
        if (this.client == undefined) {
            reply({result: 'ko', detail: 'not ready'});
        } else {
            return this.sendOrder(function() {
                return ({
                    method: "set_connected",
                    params: [ true ]
                });
            })(data, function(result) {
                if (result.result == 'ok') {
                    func(data, reply);
                } else {
                    reply(result);
                }
            });
        }
    }

    sendOrder(func) {
        var self = this;
        return function(data, reply) {
            var order = func(data, reply);

            try {
                self.client.write(JSON.stringify(order) + "\r\n");
                reply({result: 'ok'});
            } catch(e) {
                console.log('Error ' + e);
                reply({result: 'failed', detail: 'error: ' + e});
            }
        };
    }

    startGuide(data, reply) {
        this.whenConnected(data, reply, this.sendOrder(function() {
            return ({
                method: "guide",
                params: [
                    {"pixels": 1.5, "time": 10, "timeout": 60},
                    false
                ],
                id: 9334
            });
        }));
    }

    stopGuide(data, reply) {
        this.whenConnected(data, reply, this.sendOrder(function() {
            return ({
                method: 'stop_capture',
                id: 9333
            });
        }));
    }

    guide(req, res, next) {
        var self = this;
        if (this.client == undefined) {
            res.jsonResult = { status: 'error'};
            next();
        } else {
            var order = {
                method: "guide",
                params:[
                    {"pixels": 1.5, "time": 10, "timeout": 60},
                    false
                ],
                id: 9334
            };
            this.client.write( JSON.stringify(order) + "\r\n");
            res.jsonResult = { status: 'ok'};
            next();
        }
    }
}

module.exports = {Phd};
