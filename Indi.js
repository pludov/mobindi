var net = require('net');
var sax = require('sax');


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

class IndiConnection {
    
    constructor() {
        this.parser = undefined;
        this.socket = undefined;
        this.connected = false;
        this.queue = [];
        this.properties = {};
        this.listeners = [];
    }

    connect(host, port) {
        var self = this;
        
        if (port == undefined) {
            port = 7624;
        }
        var socket = new net.Socket(host, port);
        var parser = this.newParser();
        
        this.socket = socket;
        this.parser = parser;
        
        socket.on('connect', function() {
            console.log('socket connected');
            self.connected = true;
            socket.write('<getProperties version="1.7"/>');
            self.flushQueue();
                    });
        socket.on('data', function(data) {
            parser.write(data);
            parser.flush();
        });
        socket.on('error', function(err) {
            console.log('socket error: ' + err);
        });
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

    
    checkListeners() {
        var self = this;        
        self.checkingListener = self.listeners.slice();
        
        process.nextTick(function() {
            while((self.checkingListener != undefined) && (self.checkingListener.length))
            {
                var todo = self.checkingListener[self.checkingListener.length - 1];
                self.checkingListener.splice(self.checkingListener.length - 1, 1);
                todo();
            }
        });
    }
    
    // FIXME: au prochain tour...
    wait(predicate) {
        var self = this;
        var listener;
        var onDoneList = [];
        var onErrorList = [];
        var onCanceledList = [];
        var canceled = false;
        
        function on(arr, result)
        {
            for(var i = 0; i < arr.length; ++i)
            {
                arr[i](result);
            }
            return arr.length > 0;
        }
        
        function dettach()
        {
            if (listener != undefined) {
                self.removeListener(listener);
                listener = undefined;
            }
        }
        
        return  {
            then: function(f) {
                onDoneList.push(f);
                return this;
            },
            start:function() {
                var result;
                try {
                    result = predicate();
                } catch(e) {
                    if (!on(onErrorList, e)) throw e;
                    return this;
                }
                if (!result) {
                    console.log('predicate false');
                    listener = function() {
                            if (canceled) return;
                            var result;
                            try {
                                result = predicate();
                            } catch(e) {
                                on(onErrorList, e);
                                return;
                            }
                            if (result == false || result == undefined) {
                                return;
                            }
                            dettach();
                            on(onDoneList, result);
                    };
                    // Add a listener...
                    self.addListener(listener);
                } else {
                    console.log('predicate true');
                    on(onDoneList, result);
                }
                return this;
            },
            
            cancel: function() {
                this.canceled = true;
                dettach();
                on(onCancelList);
                return this;
            }
        };
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

    queueMessage(msg) {
        this.queue.push(msg);
        this.flushQueue();
    }

    newParser() {
        var self = this;
        var parser = sax.parser(true)
        var level = 2;
        var currentNodes = [];
        var currentSchemas = [];
        var currentLevel = 0;

        parser.onopentag = function (node) {
            var name = node.name;
            currentLevel++;
            if (currentLevel >= level) {
                var id = currentLevel - level;

                if (id == 0) {
                    currentSchemas[id] = schema[name];
                } else {
                    currentSchemas[id] = currentSchemas[id - 1][name];
                }
                if (currentSchemas[id] == undefined) {
                    currentSchemas[id] = {};
                }

                var currentSchema = currentSchemas[id];
                
                var newNode = {};
          
                if (id == 0) {
                    newNode.$$=name;
                } else {
                    if (currentSchema.$isArray) {
                        currentNodes[id - 1][name].push(newNode);
                    } else {
                        currentNodes[id - 1][name] = newNode;
                    }
                }
                for(var key in node.attributes) {
                    newNode['$' + key] = node.attributes[key];
                }
          
                for(var childId in currentSchema) {
                    if (currentSchema[childId].$isArray) {
                        newNode[childId] = [];
                    }
                }

                currentNodes[id] = newNode;
            }
        };

        parser.ontext = function(text) {
            var id = currentLevel - level;
            if (id >= 0) {
                if (currentSchemas[id].$notext) {
                    return;
                }
                // Hackish: trim but keep possibility to have \n
                text = text.replace(/^\n/, '');
                text = text.replace(/\n *$/, '');
                currentNodes[id].$_ = text;
            }
        }

        parser.onclosetag = function (name) {
            currentLevel--;
            if (currentLevel ==  level - 1) {
                // End of current message
                console.log('finished message parsing: ' + JSON.stringify(currentNodes[0]));
                self.onMessage(currentNodes[0]);
            }
            if (currentLevel >= level - 1) {
                delete currentNodes[currentLevel - (level - 1)];
            }
        };


        parser.onerror = function(e) {
            console.log('xml error: ' + e);
            self.onProtocolError(e);
        };
        
        parser.write('<dummystartup>');

        return parser;
    }

    onMessage(message) {
        if (message.$$.match(/^def.*Vector$/)) {
            var childsProps = message.$$.replace(/Vector$/, '');

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
                        
            this.properties[message.$name] = message;
//            console.log('Properties: ' + JSON.stringify(this.properties, null, 2));
        }
        
        if (message.$$.match(/^set.*Vector$/)) {
            var kind = message.$$.replace(/Vector$/, '').replace(/^set/, '');
            var childsProp = 'def' + kind;
            
            var prop = this.properties[message.$name];
            if (prop == undefined) {
                console.warn('Received set for unknown property: ' . JSON.stringify(message, null, 2));
                return;
            }

            prop.$state = message.$state;
            prop.$timeout = message.$timeout;
            prop.$timestamp = message.$timestam;
            prop.$message = message.$message;
                        
            var updates = message['one' + kind];
            if (updates == undefined) {
                console.warn('Wrong one' + kind + ' in: ' . JSON.stringify(message, null, 2));
                return;
            }
            
            for(var i = 0; i < updates.length; ++i) {
                var update = updates[i];
                var current = prop.childs[update.$name];
                if (current == undefined) {
                    console.warn('Unknown one' + kind + ' in: ' . JSON.stringify(message, null, 2));
                    return;
                }
                console.log('Should update:\n' + JSON.stringify(current) + '\n=>' + JSON.stringify(update));
                current.$_ = update.$_;
            }
            
        }
        this.checkListeners();
    }

    getVector(device, property)
    {
        if (!(property in this.properties)) {
            return null;
        }
        return this.properties[property];
    }


    getProperty(device, property, name)
    {
        if (!(property in this.properties)) {
            return null;
        }
        var prop = this.properties[property];
        if (!(name in prop.childs)) {
            return null;
        }

        return prop.childs[name];
    }
    
    getPropertyValue(device, property, name)
    {
        var property = this.getProperty(device, property, name);
        if (property == null) return null;
        return property.$_;
    }
}


var connection = new IndiConnection();
connection.connect('127.0.0.1');


console.log('Waiting connection');
connection.queueMessage('<newSwitchVector device="CCD Simulator" name="CONNECTION"><oneSwitch name="CONNECT" >On</oneSwitch></newSwitchVector>');

connection.wait(function() {
    var status = connection.getPropertyValue("CCD Simulator", 'CONNECTION', 'CONNECT');
    console.log('Status is : ' + status);
    if (status != 'On') return false;
    
    return connection.getProperty("CCD Simulator", "CCD_EXPOSURE", "CCD_EXPOSURE_VALUE") != null;
}).then(function() {
    console.log('Connection established');
    connection.getVector("CCD Simulator", "CCD_EXPOSURE").$state = "Busy";
    connection.queueMessage('<newNumberVector device="CCD Simulator" name="CCD_EXPOSURE"><oneNumber name="CCD_EXPOSURE_VALUE">10</oneNumber></newNumberVector>');
    console.log('Initial exposure is :' + connection.getPropertyValue("CCD Simulator", "CCD_EXPOSURE", "CCD_EXPOSURE_VALUE"));
    
    connection.wait(function() {
        var vector = connection.getVector("CCD Simulator", "CCD_EXPOSURE");
        if (vector == null) {
            throw "CCD_EXPOSURE disappeared";
        }

        if (vector.$state == "Busy") {
            return false;
        }

        var value = connection.getProperty("CCD Simulator", "CCD_EXPOSURE", "CCD_EXPOSURE_VALUE");
        if (value == null) {
            throw "CCD_EXPOSURE_VALUE disappered";
        }
        
        return (value.$_ == 0);
    }).then(function() {
        console.log('shoot done');
    }).start();
    
/*    var status = getConnectionValue("CCD Simulator", 'CONNECTION');

    if (status == 'Off') {
    }
    
    connection.wait(function() {
        return connection.properties['CONNECTION'].$$ == 'On';
    }).then(function() {
        console.log('connected !\n');
    });*/
    
}).start();


/*  console.log('testing');
  parser.write('<dummystartup>');

  console.log('test ok');
  
  var xml = "<start><a>plop</a><b>glop</b>\n";
  
  
  parser.write(xml);
  parser.write("<c>\n");
  parser.write("coucou</c>");
*/