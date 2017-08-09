'use strict';

const net = require('net');
const Promises = require('./Promises');

class Phd {
    constructor(app, appStateManager)
    {
        this.appStateManager = appStateManager;

        this.running = true;

        this.appStateManager.getTarget().phd = {
            // Connecting
            phd_started: false,

            connected: false,

            AppState: "NotConnected"
        }

        this.pendingRequests = {};

        this.currentStatus = this.appStateManager.getTarget().phd;
        this.currentStatus.guideSteps = {};
        // Cet objet contient les dernier guide step
        this.steps = this.currentStatus.guideSteps;
        this.stepId = 0;
        this.currentStatus.firstStepOfRun = this.stepIdToUid(this.stepId);

        this.reqId = 0;

        this.updateStepsStats();

        this.lifeCycle().start();
    }


    lifeCycle() {
        var self = this;
        return (
            new Promises.Loop(
                new Promises.Chain(
                    new Promises.Cancelable(function(next) {
                        next.setCancelFunc(() => {
                            if (self.client != undefined) {
                                try {
                                    self.client.close();
                                } catch(e) {
                                    console.log('Failed to close', e);
                                }
                            }
                        });

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

                            var oldPendingRequests = self.pendingRequests;
                            self.pendingRequests = {};
                            for(var k in oldPendingRequests) {
                                oldPendingRequests[k].error('PHD disconnected');
                            }

                            self.currentStatus.star = null;
                            self.currentStatus.AppState = "NotConnected";

                            if (next.isActive()) {
                                next.done();
                            }
                        });

                        self.client.connect(4400, '127.0.0.1', function() {
                            console.log('Connected to phd');
                        });

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
        var minUid = this.currentStatus.firstStepOfRun;
        Outer: for(var uid in this.steps)
        {
            if (uid < minUid) continue;

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
                            break;
                        default:
                            if (event.Event in eventToStatus) {
                                var newStatus = eventToStatus[event.Event];
                                var oldStatus = self.currentStatus.AppState;
                                if (oldStatus != newStatus) {
                                    self.currentStatus.star = null;
                                    self.currentStatus.AppState = newStatus;
                                    if (newStatus == 'Guiding' && oldStatus != 'Paused' && oldStatus != 'LostLock') {
                                        self.currentStatus.firstStepOfRun = self.stepIdToUid(this.stepId + 1);
                                        self.updateStepsStats();
                                    }
                                    console.log('New status:' + self.currentStatus.AppState);
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
                        if (self.stepId > 400) {
                            delete self.steps[self.stepIdToUid(self.stepId - 400)];
                        }
                        self.steps[self.stepIdToUid(self.stepId)] = simpleEvent;
                        self.updateStepsStats();
                    }
                } else if ("jsonrpc" in event) {
                    var id = event.id;
                    if (Object.prototype.hasOwnProperty.call(self.pendingRequests, id)) {
                        console.log('got result for request ' + id);
                        var doneRequest = self.pendingRequests[id];
                        delete self.pendingRequests[id];
                        try {
                            if (Object.prototype.hasOwnProperty.call(event, 'error')) {
                                doneRequest.error(event.error);
                            } else {
                                doneRequest.then(event.result);
                            }
                        }catch(e) {
                            console.error('Phd request callback error:', e.stack || e);
                        }
                    }
                }
            }catch(e) {
                console.error('Phd error:', e.stack || e);
            }
        }
    }

    getStatus(req, res, next)
    {
        res.jsonResult = this.currentStatus;
        next();
    }


    // Return a promise that send the order (generator) and waits for a result
    // Not cancelable
    sendOrder(dataProvider) {
        var self = this;

        return new Promises.Cancelable((next, arg) => {
            if (self.client == undefined) {
                throw "PHD not connected";
            }

            var uid = this.reqId++;

            var order = Object.assign({}, dataProvider(arg));
            order.id = uid;

            console.log('Pushing request: ' + JSON.stringify(order));
            self.client.write(JSON.stringify(order) + "\r\n");

            self.pendingRequests[uid] = {
                then: function(rslt) {
                    next.done(rslt);
                },
                error: function(err) {
                    next.error(err);
                }
            }
        });
    }

    $api_connect(data, progress) {
        return this.sendOrder(() => ({
            method: "set_connected",
            params: [ true ]
        }));
    }

    $api_startGuide(data, progress) {
        return new Promises.Chain(
            this.$api_connect(undefined, progress),
            this.sendOrder(() => ({
                method: "guide",
                params: [
                    {"pixels": 1.5, "time": 10, "timeout": 60},
                    false
                ]
            }))
        );
    }

    $api_stopGuide(data, progress) {
        return new Promises.Chain(
            this.$api_connect(undefined, progress),
            this.sendOrder(() => ({
                method: 'stop_capture',
            }))
        );
    }
}

module.exports = {Phd};
