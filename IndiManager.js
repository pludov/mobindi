/**
 * Created by ludovic on 21/07/17.
 */

'use strict';

const Xml2JSONParser = require('./Xml2JSONParser.js');
const {IndiConnection} = require('./Indi');
const Promises = require('./Promises');
const fs = require('fs');

function has(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
}

function clear(obj) {
    for(var k in obj) {
        if (has(obj, k)) {
            delete(obj[k]);
        }
    }
}

const DriverXmlSchema = {
    driversList: {
        devGroup: {
            $isArray:true,
            $notext: true,
            device: {
                $isArray:true
            }
        }
    }
};

class IndiManager {

    constructor(app, appStateManager) {
        var self = this;
        this.appStateManager = appStateManager;
        this.appStateManager.getTarget().indiManager = {
            // connecting, connected, error
            status: "connecting",
            deviceTree: {},
            // Maps indi drivers to group
            driverToGroup: {}
        }

        

        this.currentStatus = this.appStateManager.getTarget().indiManager;

        this.initConfiguration('indiManager', {
            driverPath: '/usr/share/indi/,/opt/share/indi/'
        });

        // List configuration settings
        this.appStateManager.addSynchronizer(['configuration', 'indiManager', 'driverPath'], () => {self.readDrivers();}, true);

        this.lifeCycle = this.buildLifeCycle();
        this.lifeCycle.start();
    }

    // FIXME: move up in class hierarchy
    initConfiguration(name, defaults)
    {
        function createChildObject(parent, name)
        {
            if (!Object.prototype.hasOwnProperty.call(parent, name)) {
                parent[name] = {};
            }
        }

        function sync(target, value) {
            for(var key of Object.keys(defaults)) {
                var value = defaults[key];
                if (Object.prototype.hasOwnProperty.call(target, value)) {
                    // Recurse in sub objects ?
                    continue;
                }
                // We can put here since proxy mechanism will deep clone
                target[key] = value;
            }
        }

        var root = this.appStateManager.getTarget();
        createChildObject(root, 'configuration');
        createChildObject(root.configuration, name);
        sync(root.configuration[name], defaults);
    }

    readDrivers()
    {
        var pathList = this.appStateManager.getTarget().configuration.indiManager.driverPath.split(',');
        
        var driverToGroup = {};

        pathList.forEach((path)=>
        fs.readdirSync(path).filter(file => (file.match(/\.xml$/) && !file.match(/_sk\.xml$/))).forEach((file)=> {
            file = path + '/' + file;
            console.log('Found driver: ' + file);
            
            try {
                function onMessage(e) {
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
                parser.write(content)
                parser.close();
            } catch(e) {
                console.log('Unable to parse ' + file, e.stack || e);
            }
        }));

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

                        next.done(indiConnection.wait(()=>{
                            console.log('socket is ' + indiConnection.socket);
                            return indiConnection.socket == undefined;
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

    getValidConnection()
    {
        var connection = this.connection;
        if (connection === undefined) {
            throw new Error("Indi server not connected");
        }
        return this.connection;
    }

    // Return a promise that will set the value of the
    // device and value can be function
    // valFn returns a map to set at the vector, may be a function receiving the current state
    setParam(device, vectorFn, valFn)
    {
        var self = this;
        return new Promises.Builder((e)=>
        {
            var connection = self.getValidConnection();
            var devId = Promises.dynValue(device);
            
            var dev = connection.getDevice(devId);

            var vectorId = Promises.dynValue(vectorFn);

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
                connection.wait(() => (getVec().getState() != "Busy")),
                new Promises.Immediate(() => {
                    var vec = getVec();

                    var value = Promises.dynValue(valFn, vec);
                    var diff = false;
                    
                    var todo = [];
                    for(var key in value) {
                        if (vec.getPropertyValueIfExists(key) !== value[key]) {
                            todo.push({name: key, value: value[key]});
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


    $api_setProperty(message, progress)
    {
        return new Promises.Immediate(() => {
            var dev = this.getValidConnection().getDevice(message.data.dev);
            dev.getVector(message.data.vec).setValues( message.data.children);
        });
    }


}

module.exports = {IndiManager};