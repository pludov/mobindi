/**
 * Created by ludovic on 21/07/17.
 */
import fs from 'fs';
import {xml2JsonParser as Xml2JSONParser, Schema} from './Xml2JSONParser';
import {IndiConnection, Vector, Device} from './Indi';
import * as Promises from './Promises';
import { ExpressApplication, AppContext } from "./ModuleBase";
import { IndiManagerStatus, IndiManagerConnectDeviceRequest, IndiManagerDisconnectDeviceRequest, IndiManagerSetPropertyRequest, IndiManagerRestartDriverRequest, IndiManagerUpdateDriverParamRequest, BackofficeStatus } from './shared/BackOfficeStatus';
import { IndiMessage } from './shared/IndiTypes';
import JsonProxy from './JsonProxy';
const IndiServerStarter = require('./IndiServerStarter');
const IndiAutoConnect = require('./IndiAutoConnect');
const IndiAutoGphotoSensorSize = require('./IndiAutoGphotoSensorSize');
const ConfigStore = require('./ConfigStore');


function has(obj:any, key:string) {
    return Object.prototype.hasOwnProperty.call(obj, key);
}

function clear(obj:any) {
    for(var k of Object.keys(obj)) {
        delete(obj[k]);
    }
}

const DriverXmlSchema:Schema = {
    driversList: {
        devGroup: {
            $isArray:true,
            $notext: true,
            device: {
                $isArray:true
            }
        }
    }
} as any;

export default class IndiManager {
    appStateManager: JsonProxy<BackofficeStatus>;
    currentStatus: IndiManagerStatus;
    lastMessageSerial: undefined|number;
    lastMessageStamp: undefined|number;
    lifeCycle: Promises.Cancelable<any, any>;
    indiServerStarter: any;
    connection: undefined|IndiConnection;

    constructor(app:ExpressApplication, appStateManager:JsonProxy<BackofficeStatus>, context: AppContext) {
        var self = this;
        this.appStateManager = appStateManager;
        this.appStateManager.getTarget().indiManager = {
            // connecting, connected, error
            status: "connecting",
            deviceTree: {},
            // Messages by uids
            messages: {
                byUid: {}
            },
            // Maps indi drivers to group
            driverToGroup: {},
            configuration: {
                driverPath: "none",
                indiServer: null,
            }
        }

        this.currentStatus = this.appStateManager.getTarget().indiManager;
        this.lastMessageSerial = undefined;
        this.lastMessageStamp = undefined;
        new ConfigStore(appStateManager, 'indi', ['indiManager', 'configuration'], {
            driverPath: '/usr/share/indi/',
            indiServer: {
                autorun: false,
                path: null,
                fifopath: null,
                devices: {}
            }
        }, {
            driverPath: '/usr/share/indi/,/opt/share/indi/',
            indiServer: {
                autorun: true,
                path: '/opt/bin',
                fifopath: null,
                devices: {
                    'CCD Simulator': {
                        driver: 'indi_simulator_ccd',
                        config: 'ccd_simul',
                        prefix: null,
                        skeleton: null
                    }
                }
            }
        });

        // List configuration settings
        this.appStateManager.addSynchronizer(['indiManager', 'configuration', 'driverPath'], () => {self.readDrivers();}, true);

        this.lifeCycle = this.buildLifeCycle();
        this.lifeCycle.start(undefined);

        this.indiServerStarter = new IndiServerStarter(this.currentStatus.configuration.indiServer);

        new IndiAutoConnect(this);
        new IndiAutoGphotoSensorSize(this);
    }

    public createDeviceListSynchronizer(cb: (devices: string[])=>(void), driverClass?: string, interfaceMask?:number)
    {
        const updateAvailableDevices = () => {
            // Re-List all devices
            var availableDevices = [];
            for(var deviceId of Object.keys(this.currentStatus.deviceTree).sort()) {
                var device = this.currentStatus.deviceTree[deviceId];
                if (driverClass !== undefined) {
                    try {
                        const driver = device.DRIVER_INFO.childs.DRIVER_EXEC.$_;
                        if (this.currentStatus.driverToGroup[driver] !== driverClass) {
                            continue;
                        }
                    } catch(e) {
                        continue;
                    }
                }

                if (interfaceMask !== undefined) {
                    try {
                        const interfaceValue = parseInt(device.DRIVER_INFO.childs.DRIVER_INTERFACE.$_, 10);
                        if ((interfaceValue & interfaceMask) !== interfaceMask) {
                            continue;
                        }
                    } catch(e) {
                        continue;
                    }
                }

                console.log('got a device: ' + deviceId)
                availableDevices.push(deviceId);
            }
            cb(availableDevices);
        }

        // Update available devices on driver desc and deviceTree change 
        this.appStateManager.addSynchronizer(
            [
                'indiManager',
                    [
                        // Bind to driver_exec of each device
                        ['deviceTree', null, 'DRIVER_INFO', 'childs', 
                            [
                                ['DRIVER_EXEC', '$_'],
                                ['DRIVER_INTERFACE', '$_']
                            ]
                        ],
                        // Bind to driverToGroup mapping (any change)
                        ['driverToGroup',null]
                    ]
            ], updateAvailableDevices, true);
    }

    nextMessageUid() {
        var now = new Date().getTime();
        let serial:number = 0;
        if (this.lastMessageStamp !== undefined) {
            if (this.lastMessageStamp > now) {
                // Don't go backward
                now = this.lastMessageStamp!;
            }
            if (this.lastMessageStamp === now) {
                serial = this.lastMessageSerial! + 1;
            } else {
                serial = 0;
            }
        } else {
            serial = 0;
        }
        this.lastMessageStamp = now;
        this.lastMessageSerial = serial;

        let serialStr = serial.toString(16);
        // Ensure lexicographical order of serial
        var prefix = '';
        for(var i = 1; i < serialStr.length; ++i) {
            prefix += 'Z';
        }
        return new Date(now).toISOString() + ":" + prefix + serialStr;
    }

    readDrivers()
    {
        var pathList = this.currentStatus.configuration.driverPath.split(',');

        var driverToGroup : {[id:string]:string}= {};

        pathList.forEach((path)=>{
            var content:string[] = [];
            try {
                content = fs.readdirSync(path);
            } catch(e) {
            }

            content.filter(file => (file.match(/\.xml$/) && !file.match(/_sk\.xml$/))).forEach((file)=> {
                file = path + '/' + file;
                console.log('Found driver: ' + file);

                try {
                    function onMessage(e:any) {
                        if (e.$$ != 'driversList') {
                            console.warn('Ignored xml driver content: ' + JSON.stringify(e, null, 2));
                            return;
                        }
                        try {
                            for(var group of e.devGroup)
                            {
                                for(var device of group.device) {
                                    var driver = device.driver.$_;
                                    driverToGroup[driver] = group.$group;
                                }
                            }
                        } catch(e) {
                            console.error('Failed to parse xml drivers', e.stack || e);
                        }
                    }
                    var content = fs.readFileSync(file);
                    var parser = Xml2JSONParser(DriverXmlSchema, 1, onMessage);
                    parser.write(content.toString('utf-8'))
                    parser.close();
                } catch(e) {
                    console.log('Unable to parse ' + file, e.stack || e);
                }
            });
        });

        this.currentStatus.driverToGroup = driverToGroup;
    }

    refreshStatus()
    {
        if (this.connection == undefined) {
            this.currentStatus.status = "error";
            clear(this.currentStatus.deviceTree);

        } else if (!this.connection.connected) {
            this.currentStatus.status = "connecting";
            clear(this.currentStatus.deviceTree);
        } else {
            this.currentStatus.status = "connected";
        }
    }

    buildLifeCycle() {
        const self = this;
        return (
            new Promises.Loop(
                new Promises.Chain(
                    new Promises.Cancelable((next) => {
                        var indiConnection = new IndiConnection();
                        self.connection = indiConnection;
                        self.connection.deviceTree = this.currentStatus.deviceTree;

                        // start
                        var listener = function() {
                            self.refreshStatus();
                        };

                        indiConnection.connect('127.0.0.1');
                        indiConnection.addListener(listener);
                        indiConnection.addMessageListener(function(msg) {
                            var msgUid = self.nextMessageUid();
                            console.log('Received message : ', JSON.stringify(msg));
                            self.addMessage(msg);
                            self.cleanupMessages();
                        });
                        next.done(indiConnection.wait(()=>{
                            return indiConnection.isDead();
                        }, true).then(() => {
                            console.log('Indi connection disconnected');
                            indiConnection.removeListener(listener);
                            if (self.connection == indiConnection) {
                                self.connection = undefined;
                                self.refreshStatus();
                            }
                        }));
                    }),
                    new Promises.ExecutePromise(),
                    new Promises.Sleep(2000)
                )
            )
        );
    }

    addMessage(m:IndiMessage)
    {
        var uid = this.nextMessageUid();
        this.currentStatus.messages.byUid[uid] = {...m, uid};
        this.cleanupMessages();
    }

    cleanupMessages()
    {
        var maxMessages = 100;
        var keys = Object.keys(this.currentStatus.messages.byUid);
        if (keys.length > maxMessages) {
            keys.sort();
            for(var i = 0; i < keys.length - maxMessages; ++i) {
                delete this.currentStatus.messages.byUid[keys[i]];
            }
        }
    }

    getValidConnection():IndiConnection
    {
        var connection = this.connection;
        if (connection === undefined) {
            throw new Error("Indi server not connected");
        }
        return connection;
    }

    // Return a promise that waits until the vector exists
    waitForVectors<INPUT>(device:Promises.DynValueProvider<string,INPUT>, vectorFn: Promises.DynValueProvider<string|string[], INPUT>)
    {
        var self = this;
        return new Promises.Builder<INPUT,void>((e:INPUT)=>
        {
            var connection = self.getValidConnection();
            var devId = Promises.dynValue(device, e);
            var dev = connection.getDevice(devId);

            var vectorIds = Promises.dynValue(vectorFn, e);
            if (!Array.isArray(vectorIds)) {
                vectorIds = [vectorIds];
            }
            console.log('Sync with vectors:' + JSON.stringify(vectorIds));
            for(var i = 0; i < vectorIds.length; ++i) {
                var vectorId = vectorIds[i];
                var vecInstance = dev.getVector(vectorId);
                if (!vecInstance.exists()) {
                    // FIXME: wait until ?
                    console.log('Waiting for vector ' + vectorId + ' on ' + devId);
                    return new Promises.Sleep(1000);
                }
            }
            
            return undefined;
        });
    }

    // Return a promise that will set the value of the
    // device and value can be function
    // valFn returns a map to set at the vector, may be a function receiving the current state
    setParam<INPUT>(device:Promises.DynValueProvider<string,INPUT>,
                    vectorFn:Promises.DynValueProvider<string,INPUT>,
                    valFn:Promises.DynValueProvider<{[id:string]:string|null|undefined}, Vector>,
                    force?: boolean)
    {
        var self = this;
        return new Promises.Builder<INPUT, void>((e)=>
        {
            var connection = self.getValidConnection();
            var devId = Promises.dynValue(device, e);
            
            var dev = connection.getDevice(devId);

            var vectorId = Promises.dynValue(vectorFn, e);

            if (dev === undefined || ((vectorId != 'CONNECTION') && dev.getVector('CONNECTION').getPropertyValueIfExists('CONNECT') !== 'On')) {
                throw new Error("Device is not connected : " + devId);
            }

            function getVec() {
                var dev = connection.getDevice(devId);

                var vecInstance = dev.getVector(vectorId);
                if (vecInstance === null) throw new Error("Property vanished: " + vectorId);
                return vecInstance;
            }

            return new Promises.Chain(
                self.waitForVectors(devId, vectorId),
                connection.wait(() => (getVec().getState() != "Busy")),
                new Promises.Immediate(() => {
                    var vec = getVec();

                    var value = Promises.dynValue(valFn, vec);
                    var diff = false;
                    
                    var todo = [];
                    for(var key in value) {
                        var v = value[key];
                        if (v === null || v === undefined) {
                            continue;
                        }
                        console.log('Setting value: ' + v);
                        if (force || (vec.getPropertyValueIfExists(key) !== v)) {
                            todo.push({name: key, value: v});
                        }
                    }

                    if (!todo.length) {
                        console.log('Skipping value already set for ' + vectorId + " : " + JSON.stringify(value));
                        // Value is ready.
                        return null;
                    } else {
                        vec.setValues(todo);
                        return connection.wait(() => (getVec().getState() != "Busy"));
                    }
                }),
                new Promises.ExecutePromise()
            );
        });
    }


    checkDeviceConnected(deviceId:string):Device {
        const device = this.getValidConnection().getDevice(deviceId);
        if (device.getVector('CONNECTION').getPropertyValueIfExists('CONNECT') !== 'On') {
            throw new Error("Device " + deviceId + " is not connected");
        }
        return device;
    }

    connectDevice<INPUT>(deviceFn:Promises.DynValueProvider<string,INPUT>)
    {
        var self = this;

        var device:string;
        // Set connected to true, then wait for status, then load configuration
        return new Promises.Chain<INPUT, void>(
            new Promises.Conditional((e) => {
                    device = Promises.dynValue(deviceFn, e);
                    var vector = this.getValidConnection().getDevice(device).getVector('CONNECTION');
                    if (!vector.isReadyForOrder()) {
                        throw "Connection already pending";
                    }
                    var perform = vector.getPropertyValue('CONNECT') != 'On';
                    if (perform) {
                        console.log('Connecting: ' + device);
                    }
                    return perform;
                },
                new Promises.Chain(
                    this.setParam(()=>(device), 'CONNECTION', () => ({CONNECT: "On"})),
                    this.setParam(()=>(device), 'CONFIG_PROCESS', () => ({CONFIG_LOAD: "On"}))
                )
            )
        );
    }

    disconnectDevice<INPUT>(deviceFn:Promises.DynValueProvider<string,INPUT>)
    {
        var self = this;

        var device:string;
        return new Promises.Chain(
            new Promises.Conditional((e: INPUT) => {
                    device = Promises.dynValue(deviceFn, e);
                    var vector = this.getValidConnection().getDevice(device).getVector('CONNECTION');
                    if (!vector.isReadyForOrder()) {
                        throw "Connection already pending";
                    }
                    var perform = vector.getPropertyValue('CONNECT') != 'Off';
                    if (perform) {
                        console.log('Connecting: ' + device);
                    }
                    return perform;
                },
                new Promises.Chain(
                    this.setParam(()=>(device), 'CONNECTION', () => ({DISCONNECT: "On"}))
                )
            )
        );
    }

    $api_connectDevice(message:IndiManagerConnectDeviceRequest, progress:any)
    {
        return this.connectDevice(message.device);
    }

    $api_disconnectDevice(message:IndiManagerDisconnectDeviceRequest, progress:any)
    {
        return this.disconnectDevice(message.device);
    }

    $api_setProperty(message:IndiManagerSetPropertyRequest, progress:any)
    {
        return new Promises.Immediate(() => {
            var dev = this.getValidConnection().getDevice(message.data.dev);
            dev.getVector(message.data.vec).setValues( message.data.children);
        });
    }

    $api_restartDriver(message:IndiManagerRestartDriverRequest, progress:any)
    {
        return new Promises.Immediate(() => {
            this.indiServerStarter.restartDevice(message.driver);
        });
    }

    $api_updateDriverParam(message:IndiManagerUpdateDriverParamRequest, progress:any)
    {
        return new Promises.Immediate(() => {
            if (!Object.prototype.hasOwnProperty.call(this.currentStatus.configuration.indiServer.devices, message.driver)) {
                throw new Error("Device not found");
            }
            const dev = this.currentStatus.configuration.indiServer.devices[message.driver];
            if (!dev.options) {
                dev.options = {};
            }
            dev.options[message.key] = message.value;
        });
    }
}
