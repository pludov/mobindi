'use strict';

const xmlbuilder = require('xmlbuilder');
const net = require('net');

const Promises = require('./Promises');
const Xml2JSONParser = require('./Xml2JSONParser.js');

const schema = {
      
      
      defTextVector: {
          $notext: true,
          defText: {
            $isArray: true
          }  
      },
      
      defNumberVector: {
          $notext: true,
          defNumber: {
            $isArray: true
          }
      },
      
      defSwitchVector: {
          $notext: true,
          defSwitch: {
            $isArray: true
          }
      },
      
      defLightVector: {
          $notext: true,
          defLight: {
            $isArray: true
          }
      },
      
      setTextVector: {
          $notext: true,
          oneText: {
            $isArray: true
          }
      },
      
      setNumberVector: {
          $notext: true,
          oneNumber: {
            $isArray: true
          }
      },
      
      setSwitchVector: {
          $notext: true,
          oneSwitch: {
            $isArray: true
          }
      },
      
      setLightVector: {
          $notext: true,
          oneLight: {
            $isArray: true
          }
      },
      
      delProperty: {
          $notext: true
      },
      
      message: {
      }
};

// Each change/notification will increment this by one
var globalRevisionId = 0;

function has(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
}

class Vector {
    constructor(connection, device, vectorId) {
        this.connection = connection;
        this.device = device;
        this.vectorId = vectorId;
    }

    getVectorInTree()
    {
        if (!has(this.connection.deviceTree, this.device))
        {
            return null;
        }
        var dev = this.connection.deviceTree[this.device];
        if (!has(dev, this.vectorId)) {
            return null;
        }
        return dev[this.vectorId];
    }

    getExistingVectorInTree()
    {
        var rslt = this.getVectorInTree();
        if (rslt === null) throw new Error("Property not found: " + this.device + "/" + this.vectorId);
        return rslt;
    }

    exists() {
        return this.getVectorInTree() !== null;
    }

    // Throw device disconnected
    getState() {
        return this.getExistingVectorInTree().$state;
    }

    // Id that change for each new message concerning this vector
    getRev() {
        return this.getExistingVectorInTree().$rev;
    }

    isReadyForOrder()
    {
        var state = this.getState();
        return (state != "Busy");
    }

    // affectation is an array of {name:key, value:value}
    // Vector is switched to busy immediately
    setValues(affectations) {
        console.log('Received affectations: ' + JSON.stringify(affectations));
        var vecDef = this.getExistingVectorInTree(this.device);
        var msg = {
            $$: 'new' + vecDef.$type + 'Vector',
            $device: this.device,
            $name: this.vectorId,
            ['one' + vecDef.$type]: affectations.map(item => {
                return {
                    $name: item.name,
                    $_: item.value
                }
            })
        };
        vecDef.$state = "Busy";

        var xml = this.connection.toXml(msg)
        this.connection.queueMessage(xml);
    }

    // Return the value of a property.
    // throw if the vector or the property does not exists
    getPropertyValue(name) {
        var vecDef = this.getExistingVectorInTree();
        if (!has(vecDef.childs, name)) {
            throw new Error("Property not found: " + this.device + "/" + this.vectorId + "/" + name);
        }
        var prop = vecDef.childs[name];
        return prop.$_;
    }

    getPropertyValueIfExists(name) {
        var vecDef = this.getVectorInTree();
        if (vecDef === null) return null;
        if (!has(vecDef.childs, name)) {
            return null;
        }
        var prop = vecDef.childs[name];
        return prop.$_;
    }
}


class Device {

    constructor(connection, device) {
        this.connection = connection;
        this.device = device;
    }

    getDeviceInTree()
    {
        if (!has(this.connection.deviceTree, this.device))
        {
            throw "Device not found: " + this.device;
        }
            
        return this.connection.deviceTree[this.device];
    }

    getVector(vectorId)
    {
        return new Vector(this.connection, this.device, vectorId);
    }


    // getProperty(property, name)
    // {
    //     var devProps = this.getDeviceInTree(this.device);

    //     if (!has(devProps, property)) {
    //         return null;
    //     }
    //     var prop = devProps[property];
    //     if (!has(prop.childs, name)) {
    //         return null;
    //     }

    //     return prop.childs[name];
    // }

    // getPropertyValue(property, name)
    // {
    //     var property = this.getProperty( property, name);
    //     if (property == null) return null;
    //     return property.$_;
    // }


}

class IndiConnection {
    
    constructor() {
        this.parser = undefined;
        this.socket = undefined;
        this.connected = false;
        this.queue = [];
        this.deviceTree = {};
        this.listeners = [];
        this.dead = false;
    }

    connect(host, port) {
        var self = this;
        
        if (port == undefined) {
            port = 7624;
        }
        console.log('Opening indi connection to ' + host + ':' + port);
        var socket = new net.Socket(host, port);
        var parser = this.newParser((msg)=>self.onMessage(msg));
        
        this.socket = socket;
        this.parser = parser;
        
        socket.on('connect', function() {
            console.log('socket connected');
            self.connected = true;
            socket.write('<getProperties version="1.7"/>');
            self.flushQueue();
            ++globalRevisionId;
        });
        socket.on('data', function(data) {
            parser.write(data);
            parser.flush();
        });
        socket.on('error', function(err) {
            console.log('socket error: ' + err);
        });
        socket.on('close', function() {
            ++globalRevisionId;
            console.log('socket closed');
            try {
                self.socket.destroy();
            } catch(e) {
                console.log('closing error', e);
            }
            self.connected = false;
            self.queue = [];
            self.socket = undefined;
            self.parser = undefined;
            self.dead = true;
            self.checkListeners();
        })
        this.connected = false;
        socket.connect(7624, '127.0.0.1');
    }

    flushQueue() {
        if (!this.connected) return;
        
        while(this.queue.length > 0) {
            var toSend = this.queue[0];
            this.queue.splice(0, 1);
            console.log('Sending: ' + toSend);
            this.socket.write(toSend);
        }
    }

    // Ensure that all current listeners get called once, except if it gets removed in between
    checkListeners() {
        var self = this;

        self.checkingListener = self.listeners.slice();

        if (self.listeners.length == 0) return;

        process.nextTick(function() {
            while((self.checkingListener != undefined) && (self.checkingListener.length))
            {
                var todo = self.checkingListener[self.checkingListener.length - 1];
                self.checkingListener.splice(self.checkingListener.length - 1, 1);
                todo();
            }
        });
    }

    // Return a Promises.Cancelable that wait until the predicate is true
    // will be checked after every indi event
    // allowDisconnectionState: if true, predicate will be checked event after disconnection
    // The predicate will receive the promise input.
    wait(predicate, allowDisconnectionState) {
        const self = this;

        return new Promises.Cancelable(
            function(next, input) {
                var listener = undefined;

                function dettach()
                {
                    if (listener != undefined) {
                        self.removeListener(listener);
                        listener = undefined;
                    }
                }

                next.setCancelFunc(() => {
                    dettach();
                    next.cancel();
                });

                if (self.dead && !allowDisconnectionState) {
                    next.error('Indi server disconnected');
                    return;
                }
                var result = predicate(input);
                if (!result) {
                    console.log('predicate false');
                    listener = function() {
                        if (!next.isActive()) return;
                        var result;
                        try {
                            result = predicate(input);
                            if (!result) {
                                console.log('predicate still false');
                                return;
                            }
                        } catch(e) {
                            dettach();
                            next.error(e);
                            return;
                        }
                        dettach();
                        next.done(result);
                    };
                    // Add a listener...
                    self.addListener(listener);
                } else {
                    console.log('predicate true');
                    next.done(result);
                }
            }
        );
    }

    addListener(f)
    {
        this.listeners.push(f);
    }
    
    removeListener(f)
    {
        for(var i = 0; i < this.listeners.length; ++i)
        {
            if (this.listeners[i] === f) {
                this.listeners.splice(i, 1);
                break;
            }
        }
        if (this.checkingListeners != undefined) {
            for(var i = 0; i < this.checkingListeners.length; ++i)
            if (this.checkingListeners[i] === f) {
                this.checkingListeners.splice(i, 1);
                break;
            }
        }
    }
    
    onProtocolError(pe) {
            
    }

    //msg: string
    queueMessage(msg) {
        this.queue.push(msg);
        this.flushQueue();
    }

    toXml(obj) {

        var xml = xmlbuilder.create(obj.$$, undefined, undefined, {headless: true});

        function render(obj, node) {
            if (typeof obj == "string" || typeof obj == "number") {
                node.txt("" + obj);
                return;
            }
            if (obj == null) {
                return;
            }

            for(var key in obj) {
                if (!Object.prototype.hasOwnProperty.call(obj, key)) {
                    continue;
                }
                if (key == '$$') {
                    continue;
                } else if (key == "$_") {
                    node.txt(obj[key]);
                } else if (key.substr(0,1) == '$') {
                    node.att(key.substr(1), obj[key]);
                } else {
                    var childObj =  obj[key];

                    if (!Array.isArray(childObj)) {
                        childObj = [childObj];
                    }
                    for (var child of childObj) {
                        var childNode = node.e(key);
                        render(child, childNode);
                    }
                }
            }
        }
        render(obj, xml);

        return xml.end({pretty: true});
    }

    newParser(onMessage) {
        var parser = Xml2JSONParser(schema, 2, onMessage);

        var self = this;

        parser.onerror = function(e) {
            console.log('xml error: ' + e);
            self.onProtocolError(e);
        };
        
        parser.write('<dummystartup>');

        return parser;
    }

    getDeviceInTree(dev) {
        if (!has(this.deviceTree, dev)) {
            this.deviceTree[dev] = {};
        }

        return this.deviceTree[dev];
    }

    getDevice(dev) {
        return new Device(this, dev);
    }

    onMessage(message) {
        globalRevisionId++;
        if (message.$$.match(/^def.*Vector$/)) {
            var childsProps = message.$$.replace(/Vector$/, '');

            message.$type = childsProps.replace(/^def/, '');

            message.childs = {};
            message.childNames = [];
            var childs = message[childsProps];
            
            for(var i = 0; i < childs.length; ++i)
            {
                var child = childs[i];
                message.childs[child.$name] = child;
                message.childNames[i] = child.$name;
            }
            delete message[childsProps];
            message.$rev = globalRevisionId;
            this.getDeviceInTree(message.$device)[message.$name] = message;
        }

        if (message.$$=="delProperty") {
            if (!has(this.deviceTree, message.$device)) {
                console.log('Message about unknown device: ' + JSON.stringify(message));
                return;
            }
            var dev = this.deviceTree[message.$device];
            if (!has(dev, message.$name)) {
                console.log('Message about unknown vector: ' + JSON.stringify(message));
                return;
            }
            delete dev[message.$name];
        }
        
        if (message.$$.match(/^set.*Vector$/)) {
            var kind = message.$$.replace(/Vector$/, '').replace(/^set/, '');
            var childsProp = 'def' + kind;

            if (!has(this.deviceTree, message.$device)) {
                console.warn('Received set for unknown device: ' + JSON.stringify(message, null, 2));
                return;
            }
            var dev = this.deviceTree[message.$device];
            if (!has(dev, message.$name)) {
                console.warn('Received set for unknown property: ' + JSON.stringify(message, null, 2));
                return;
            }

            var prop = dev[message.$name];
            prop.$state = message.$state;
            prop.$timeout = message.$timeout;
            prop.$timestamp = message.$timestamp;
            prop.$rev = globalRevisionId;
            if (message.$message != undefined) {
                prop.$message = message.$message;
            }

            var updates = message['one' + kind];
            if (updates == undefined) {
                console.warn('Wrong one' + kind + ' in: ' + JSON.stringify(message, null, 2));
                return;
            }
            
            for(var i = 0; i < updates.length; ++i) {
                var update = updates[i];
                if (!has(prop.childs, update.$name)) {
                    console.warn('Unknown one' + kind + ' in: ' + JSON.stringify(message, null, 2));
                    continue;
                }
                var current = prop.childs[update.$name];
                var value = update.$_;
                if (value == undefined) value = "";
                current.$_ = value;
            }
        }
        this.checkListeners();
    }

}


function demo() {

    var connection = new IndiConnection();
    connection.connect('127.0.0.1');

    var indiDevice = connection.getDevice("CCD Simulator");

    console.log('Waiting connection');
    // connection.queueMessage('<newSwitchVector device="CCD Simulator" name="CONNECTION"><oneSwitch name="CONNECT" >On</oneSwitch></newSwitchVector>');

    var shoot = new Promises.Chain(
        connection.wait(function() {
            var status = connection.getDevice("CCD Simulator").getVector('CONNECTION').getPropertyValueIfExists('CONNECT');
            console.log('Status is : ' + status);
            if (status != 'On') return false;

            return connection.getDevice("CCD Simulator").getVector("CCD_EXPOSURE").getPropertyValueIfExists("CCD_EXPOSURE_VALUE") !== null;
        }),

        new Promises.Immediate(() => {
            console.log('Connection established');
            connection.getDevice("CCD Simulator").getVector("CCD_EXPOSURE").setValues({name: "CCD_EXPOSURE_VALUE", value: 10});
        }),

        connection.wait(function() {
            console.log('Waiting for exposure end');
            var vector = connection.getDevice("CCD Simulator").getVector("CCD_EXPOSURE");
            if (vector.getState() == "Busy") {
                return false;
            }

            var value = vector.getPropertyValue("CCD_EXPOSURE_VALUE");

            return (value == 0);
        })
    );

    shoot.then(function() { console.log('SHOOT: done'); });
    shoot.onError(function(e) { console.log('SHOOT: error ' + e)});
    shoot.onCancel(function() { console.log('SHOOT: canceled')});
    shoot.start();

    /*    var status = getConnectionValue("CCD Simulator", 'CONNECTION');

        if (status == 'Off') {
        }

        connection.wait(function() {
            return connection.properties['CONNECTION'].$$ == 'On';
        }).then(function() {
            console.log('connected !\n');
        });*/


    var infinite = connection.wait(function() {console.log('checking dummy cond'); return false});
    infinite.onCancel(function() { console.log('canceled !') });

    infinite = new Promises.Timeout(5000.0, infinite);
    infinite.onError(console.warn);
    infinite.start();





    /*  console.log('testing');
      parser.write('<dummystartup>');

      console.log('test ok');

      var xml = "<start><a>plop</a><b>glop</b>\n";


      parser.write(xml);
      parser.write("<c>\n");
      parser.write("coucou</c>");
    */
}

module.exports = {IndiConnection};