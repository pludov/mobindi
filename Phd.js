'use strict';

const net = require('net');
const Obj = require('./Obj.js');
const Promises = require('./Promises');
const ConfigStore = require('./ConfigStore');
const ProcessStarter = require('./ProcessStarter');

class Phd {
    constructor(app, appStateManager)
    {
        this.appStateManager = appStateManager;

        this.running = true;

        this.appStateManager.getTarget().phd = {
            // Connecting
            phd_started: false,

            connected: false,

            AppState: "NotConnected",

            // null until known
            settling: null
        }

        this.pendingRequests = {};
        this.eventListeners = {};

        this.currentStatus = this.appStateManager.getTarget().phd;
        this.currentStatus.guideSteps = {};
        this.currentStatus.configuration = {};
        // Cet objet contient les dernier guide step
        this.steps = this.currentStatus.guideSteps;
        this.stepId = 0;
        this.currentStatus.firstStepOfRun = this.stepIdToUid(this.stepId);

        this.reqId = 0;

        new ConfigStore(appStateManager, 'phd', ['phd', 'configuration'], {
            autorun: false,
            path: null,
            env: {
                DISPLAY: ":0",
                XAUTHORITY: process.env.HOME + "/.Xauthority"
            }
        }, {
            autorun: true,
            path: "/path/of/phd2/",
            env: {
                DISPLAY: "Whatever X11 setting required",
                XAUTHORITY: "Whatever other X11 setting required"
            }
        });

        this.updateStepsStats();

        new ProcessStarter('phd2', this.currentStatus.configuration);

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
                                oldPendingRequests[k].error({message: 'PHD disconnected'});
                            }

                            self.currentStatus.star = null;
                            self.currentStatus.AppState = "NotConnected";
                            self.currentStatus.settling = null;

                            self.signalListeners();

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

    signalListeners() {
        for(var k of Object.keys(this.eventListeners)) {
            if (Obj.hasKey(this.eventListeners, k)) {
                this.eventListeners[k].test();
            }
        }
    }

    pushStep(simpleEvent) {
        console.log('Push step: ' + simpleEvent);
        this.stepId++;
        if (this.stepId > 400) {
            delete this.steps[this.stepIdToUid(this.stepId - 400)];
        }
        this.steps[this.stepIdToUid(this.stepId)] = simpleEvent;
        this.updateStepsStats();
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
                            self.currentStatus.settling = null;
                            console.log('Initial status:' + self.currentStatus.AppState);
                            break;
                        case "SettleBegin":
                        case "Settling":
                            self.currentStatus.settling = {running: true};
                            break;
                        case "SettleDone":
                            var newStatus = {running: false, status: event.Status == 0};
                            if ('Error' in event) {
                                newStatus.error = event.Error;
                            }
                            console.log('PHD : settledone => ', JSON.stringify(newStatus));
                            self.currentStatus.settling = newStatus;
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
                                    if (newStatus != 'Guiding' && newStatus != 'LostLock') {
                                        self.currentStatus.settling = null;
                                    }
                                }
                            }
                    };
                    if ((event.Event == "Paused") || (event.Event == "LoopingExposuresStopped")) {
                        // Push an empty step, to cause interruption in the guiding graph
                        self.pushStep({
                            Timestamp: event.Timestamp,
                            settling: false
                        });
                    }
                    if (event.Event == "GuideStep") {
                        self.currentStatus.star = {
                            SNR: event.SNR,
                            StarMass: event.StarMass
                        };
                        // Settling is sent just before GuideStep. So not settling
                        if (self.currentStatus.settling === null) {
                            self.currentStatus.settling = {running: false};
                        }


                        var simpleEvent = Object.assign({}, event);
                        delete simpleEvent.Event;
                        delete simpleEvent.Host;
                        delete simpleEvent.Inst;
                        delete simpleEvent.Mount;
                        simpleEvent.settling = self.currentStatus.settling.running;
                        self.pushStep(simpleEvent);
                    }

                    self.signalListeners();
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

    wait(condition) {
        var self = this;
        var promise;
        var uid;

        function unregister() {
            if (uid !== undefined) {
                delete self.eventListeners[uid];
                uid = undefined;
                return true;
            }
            return false;
        }

        function init(next, arg) {
            if (self.client == undefined) {
                throw "PHD not connected";
            }
            uid = "" + self.reqId++;
            self.eventListeners[uid] = {
                test: function() {
                    var rslt;
                    try {
                        rslt = condition();
                    } catch(error) {
                        next.error(error);
                        return;
                    }

                    if (rslt) {
                        unregister();
                        next.done();
                    }
                }
            };
            next.setCancelFunc(()=>{
                if (unregister()) {
                    next.cancel();
                }
            });
        }
        var promise = new Promises.Cancelable(init);
        promise.onError(unregister);
        promise.onCancel(unregister);
        promise.then(unregister);

        return promise;
    }

    // Return a promise that send the order (generator) and waits for a result
    // Not cancelable
    sendOrder(dataProvider) {
        var self = this;
        var promise;
        var uid;

        function unregister() {
            if (uid !== undefined) {
                delete self.pendingRequests[uid];
                uid = undefined;
                return true;
            }
            return false;
        }

        function init(next, arg)
        {
            if (self.client == undefined) {
                throw "PHD not connected";
            }

            uid = "" + (self.reqId++);

            var order = Object.assign({}, dataProvider(arg));
            order.id = uid;

            console.log('Pushing request: ' + JSON.stringify(order));
            self.client.write(JSON.stringify(order) + "\r\n");

            self.pendingRequests[uid] = {
                then: function(rslt) {
                    next.done(rslt);
                },
                error: function(err) {
                    if (err.message) {
                        next.error(order.method + ": " +err.message);
                    } else {
                        next.error(order.method + " failed");
                    }
                }
            }
            next.setCancelFunc(()=>{
                if (unregister()) {
                    next.cancel();
                }
            });
        }

        promise = new Promises.Cancelable(init);
        promise.onError(unregister);
        return promise;
    }

    dither() {

        // Il faut attendre un settledone
        var self = this;
        return new Promises.Chain(
            this.sendOrder(() =>({
                method: "dither",
                params:[
                    1,/* ammount */
                    false, /* ra only */
                    {
                        pixels: 1.5,
                        time:   10,
                        timeout: 60
                    }
                ]
            })),
            this.wait(() =>{
                if (!self.currentStatus.connected) {
                    throw new Error("PHD disconnected during settle");
                }
                if (self.currentStatus.settling != null) {
                    if (self.currentStatus.settling.running) {
                        // Not done now
                        return false;
                    }
                    if (self.currentStatus.settling.status) {
                        // Sucess
                        return true;
                    }
                    if ('error 'in self.currentStatus.settling) {
                        throw new Error("Dithering failed: " + self.currentStatus.settling.error);
                    }
                    throw new Error("Dithering failed");
                }
                // Not settling ?
                console.log("PHD: not settling after dither ?");
                return false;
            })
        );
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
