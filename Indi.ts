'use strict';

import SAX from 'sax';
import xmlbuilder from 'xmlbuilder';
import net from 'net';

import CancellationToken from 'cancellationtoken';
import Log from './Log';
import {xml2JsonParser as Xml2JSONParser, Schema} from './Xml2JSONParser';
import { StringDecoder } from 'string_decoder';
import { Buffer } from 'buffer';
import { IndiMessage } from "./shared/IndiTypes";
import { IndiDevice } from './shared/BackOfficeStatus';
import { IndiMessageQueue } from './IndiMessageQueue';

export type IndiListener = ()=>(void);
export type IndiMessageListener = (m:IndiMessage)=>(void);

export type IndiPredicate<OUTPUT>=()=>OUTPUT|false;

const logger = Log.logger(__filename);

const socketEncoding = "utf-8";

const schema: Schema = {
      
      
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
} as any;


// Each change/notification will increment this by one
let globalRevisionId:number = 0;

function has(obj:any, key:string) {
    return Object.prototype.hasOwnProperty.call(obj, key);
}

export class Vector {
    public readonly connection: IndiConnection;
    public readonly device: string;
    public readonly vectorId: string;

    constructor(connection:IndiConnection, device:string, vectorId:string) {
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
    setValues(affectations:{name:string, value:string}[]) {
        logger.info('Pushing indi values', {device:this.device, vector:this.vectorId, affectations});
        var vecDef = this.getExistingVectorInTree();
        if (vecDef.$type === "Number" || vecDef.$type === "Text") {
            affectations = [...affectations];
            const known = new Set<string>();
            affectations.forEach(e=>{known.add(e.name)});
            // Send other known values
            for(const child of vecDef.childNames) {
                if (!known.has(child)) {
                    affectations.push({
                        name: child,
                        value: vecDef.childs[child].$_,
                    });
                }
            }
        }
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

        var xml = IndiConnection.toXml(msg)
        this.connection.queueMessage(xml);
    }

    // Return the value of a property.
    // throw if the vector or the property does not exists
    getPropertyValue(name:string):string {
        var vecDef = this.getExistingVectorInTree();
        if (!has(vecDef.childs, name)) {
            throw new Error("Property not found: " + this.device + "/" + this.vectorId + "/" + name);
        }
        var prop = vecDef.childs[name];
        return prop.$_;
    }

    getFirstActiveProperty():string|null {
        const vecDef = this.getExistingVectorInTree();

        for(const key of vecDef.childNames) {
            if (vecDef.childs[key].$_ === "On") {
                return key;
            }
        }
        return null;
    }

    getPropertyValueIfExists(name:string):string|null {
        var vecDef = this.getVectorInTree();
        if (vecDef === null) return null;
        if (!has(vecDef.childs, name)) {
            return null;
        }
        var prop = vecDef.childs[name];
        return prop.$_;
    }
    
    getPropertyLabelIfExists(name:string):string|null {
        var vecDef = this.getVectorInTree();
        if (vecDef === null) return null;
        if (!has(vecDef.childs, name)) {
            return null;
        }
        var prop = vecDef.childs[name];
        return prop.$label;
    }
}


export class Device {
    readonly connection:IndiConnection;
    readonly device: string;

    constructor(connection:IndiConnection, device:string) {
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

    getVector(vectorId:string)
    {
        return new Vector(this.connection, this.device, vectorId);
    }

    isConnected() {
        const vec = this.getVector('CONNECTION');
        if (!vec.exists()) {
            return false;
        }

        if (vec.getState() === "Busy") {
            return false;
        }
        return (vec.getPropertyValueIfExists("CONNECT") === "On");
    }
}

export class IndiConnection {
    deviceTree: {[deviceId:string]:IndiDevice};
    connected: boolean;
    private dead: boolean;
    private socket?: net.Socket;
    private readonly listeners:IndiListener[];
    private readonly messageListeners:IndiMessageListener[];
    private checkingListeners?:IndiListener[];
    private parser?: SAX.SAXParser;
    private messageQueue?: IndiMessageQueue;
    private queue: string[];

    constructor() {
        this.parser = undefined;
        this.socket = undefined;
        this.connected = false;
        this.queue = [];
        this.deviceTree = {};
        this.listeners = [];
        this.messageListeners = [];
        this.dead = false;
    }

    connect(host:string, port?:number) {
        var self = this;
        
        if (port === undefined) {
            port = 7624;
        }
        logger.info('Opening indi connection', {host, port});
        const messageQueue = new IndiMessageQueue(500, (msg:any)=>{
            if (messageQueue === this.messageQueue) this.onMessage(msg);
        });
        var socket = new net.Socket();
        var parser = this.newParser((msg:any)=>messageQueue.queue(msg));
        const decoder = new StringDecoder(socketEncoding);
        this.socket = socket;
        this.parser = parser;
        this.messageQueue = messageQueue;
        
        socket.on('connect', function() {
            logger.info('socket connected');
            self.connected = true;
            socket.write('<getProperties version="1.7"/>');
            self.flushQueue();
            ++globalRevisionId;
        });
        socket.on('data', function(data) {
            const decoded = decoder.write(data);
            if (decoded.length) {
                parser.write(decoded);
                parser.flush();
            }
        });
        socket.on('error', function(err) {
            logger.warn('socket error', err);
        });
        socket.on('close', function() {
            ++globalRevisionId;
            logger.info('socket closed');
            try {
                self.socket!.destroy();
            } catch(e) {
                logger.warn('closing error', e);
            }
            self.connected = false;
            self.queue = [];
            self.socket = undefined;
            self.parser = undefined;
            self.messageQueue!.dispose();
            self.messageQueue = undefined;
            self.dead = true;
            self.checkListeners();
        })
        this.connected = false;
        socket.connect(port, host);
    }

    public isDead():boolean {
        return this.dead;
    }

    flushQueue() {
        if (!this.connected) return;
        
        while(this.queue.length > 0) {
            var toSend = this.queue[0];
            this.queue.splice(0, 1);
            logger.debug('Sending', {toSend});
            this.socket!.write(Buffer.from(toSend, socketEncoding));
        }
    }

    // Ensure that all current listeners get called once, except if it gets removed in between
    checkListeners() {
        var self = this;

        self.checkingListeners = self.listeners.slice();

        if (self.listeners.length == 0) return;

        process.nextTick(function() {
            while((self.checkingListeners != undefined) && (self.checkingListeners.length))
            {
                var todo = self.checkingListeners[self.checkingListeners.length - 1];
                self.checkingListeners.splice(self.checkingListeners.length - 1, 1);
                todo();
            }
        });
    }

    // Yield until the next event
    async yield(ct: CancellationToken): Promise<void> {
        ct.throwIfCancelled();
        return new Promise<void>((resolve, reject)=> {
            const removeCb = ct.onCancelled((reason)=>{
                removeCb();
                reject(new CancellationToken.CancellationError(reason));
            });

            const listenerFunc = ()=> {
                cleanUp();
                resolve();
            };

            const cleanUp = ()=> {
                removeCb();
                this.removeListener(listenerFunc);
            }

            this.addListener(listenerFunc);
        });
    }

    // Wait until the predicate is true
    // will be checked after every indi event
    // allowDisconnectionState: if true, predicate will be checked event after disconnection (reject otherwise)
    async wait<OUTPUT>(ct: CancellationToken, predicate:IndiPredicate<OUTPUT>, allowDisconnectionState?:boolean):Promise<OUTPUT> {
        while(true) {
            if (this.dead && !allowDisconnectionState) {
                throw new Error('Indi server disconnected');
            }

            const result = predicate();
            if (result !== false) {
                return result;
            }

            await this.yield(ct);
        }
    }

    dispatchMessage(m: IndiMessage)
    {
        for(var i = 0; i < this.messageListeners.length; ++i)
        {
            try {
                this.messageListeners[i](m);
            } catch(e) {
                logger.error("error in message listener", e);
            }
        }
    }

    addMessageListener(m:IndiMessageListener)
    {
        this.messageListeners.push(m);
    }

    removeMessageListener(m:IndiMessageListener)
    {
        for(var i = 0; i < this.messageListeners.length; ++i)
        {
            if (this.messageListeners[i] === m) {
                this.messageListeners.splice(i, 1);
                break;
            }
        }
    }

    addListener(f:IndiListener)
    {
        this.listeners.push(f);
    }
    
    removeListener(f:IndiListener)
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
    
    onProtocolError(pe:Error) {
            
    }

    //msg: string
    queueMessage(msg:string) {
        this.queue.push(msg);
        this.flushQueue();
    }

    public static toXml(obj:any) {

        var xml = xmlbuilder.create(obj.$$, undefined, undefined, {headless: true});

        function render(obj:any, node:any) {
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
                    node.txt('' + obj[key]);
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

    newParser(onMessage:(node:any)=>(void)) {
        var parser = Xml2JSONParser(schema, 2, onMessage);

        var self = this;

        parser.onerror = function(e) {
            logger.error('xml error', e);
            self.onProtocolError(e);
        };
        
        parser.write('<dummystartup>');

        return parser;
    }

    getDeviceInTree(dev:string) {
        if (!has(this.deviceTree, dev)) {
            this.deviceTree[dev] = {};
        }

        return this.deviceTree[dev];
    }

    getDevice(dev:string):Device {
        return new Device(this, dev);
    }

    getAvailableDeviceIds():string[] {
        return Object.keys(this.deviceTree);
    }

    getAvailableDeviceIdsWith(requiredProps:string[]):string[]
    {
        const rslt = [];
        ext: for(let devId of Object.keys(this.deviceTree))
        {
            const dev = this.getDevice(devId);
            for(let prop of requiredProps) {
                if (!dev.getVector(prop).exists()) {
                    continue ext;
                }
            }
            rslt.push(devId);
        }
        return rslt;
    }

    onMessage(message:any) {
        globalRevisionId++;
        if (message.$$.match(/^message$/)) {
            this.dispatchMessage(message);
            return;
        }
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

            message.$timeout = parseFloat(message.$timeout)||0;
            message.$message = message.$message || "";
            message.$rev = globalRevisionId;
            this.getDeviceInTree(message.$device)[message.$name] = message;
        }

        if (message.$$=="delProperty") {
            if (!has(this.deviceTree, message.$device)) {
                logger.warn('Message about unknown device', {message});
                return;
            }
            var dev = this.deviceTree[message.$device];
            if (has(message, '$name')) {
                if (!has(dev, message.$name)) {
                    logger.warn('Message about unknown vector', {message});
                    return;
                }
                delete dev[message.$name];
            } else {
                // Device delete
                delete this.deviceTree[message.$device];
            }
        }
        
        if (message.$$.match(/^set.*Vector$/)) {
            var kind = message.$$.replace(/Vector$/, '').replace(/^set/, '');
            var childsProp = 'def' + kind;

            if (!has(this.deviceTree, message.$device)) {
                logger.warn('Received set for unknown device', {message});
                return;
            }
            var dev = this.deviceTree[message.$device];
            if (!has(dev, message.$name)) {
                logger.warn('Received set for unknown property', {message});
                return;
            }

            var prop = dev[message.$name];
            prop.$state = message.$state;
            message.$timeout = parseFloat(message.$timeout)||0;
            prop.$timestamp = message.$timestamp;
            prop.$rev = globalRevisionId;
            if (message.$message != undefined) {
                prop.$message = message.$message;
            } else {
                prop.$message = "";
            }

            var updates = message['one' + kind];
            if (updates == undefined) {
                logger.warn('Mismatched vector kind', {kind, message});
                return;
            }
            
            for(var i = 0; i < updates.length; ++i) {
                var update = updates[i];
                if (!has(prop.childs, update.$name)) {
                    logger.warn('Unknown name in update', {name: update.$name, message});
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


// function demo() {

//     var connection = new IndiConnection();
//     connection.connect('127.0.0.1');

//     var indiDevice = connection.getDevice("CCD Simulator");

//     logger.debug('Waiting connection');
//     // connection.queueMessage('<newSwitchVector device="CCD Simulator" name="CONNECTION"><oneSwitch name="CONNECT" >On</oneSwitch></newSwitchVector>');

//     var shoot = new Promises.Chain(
//         connection.wait(function() {
//             var status = connection.getDevice("CCD Simulator").getVector('CONNECTION').getPropertyValueIfExists('CONNECT');
//             logger.debug('Status is : ' + status);
//             if (status != 'On') return false;

//             return connection.getDevice("CCD Simulator").getVector("CCD_EXPOSURE").getPropertyValueIfExists("CCD_EXPOSURE_VALUE") !== null;
//         }),

//         new Promises.Immediate(() => {
//             logger.debug('Connection established');
//             connection.getDevice("CCD Simulator").getVector("CCD_EXPOSURE").setValues([{name: "CCD_EXPOSURE_VALUE", value: "10"}]);
//         }),

//         connection.wait(function() {
//             logger.debug('Waiting for exposure end');
//             var vector = connection.getDevice("CCD Simulator").getVector("CCD_EXPOSURE");
//             if (vector.getState() == "Busy") {
//                 return false;
//             }

//             var value = vector.getPropertyValue("CCD_EXPOSURE_VALUE");

//             return (parseFloat(value) === 0);
//         })
//     );

//     shoot.then(function() { logger.debug('SHOOT: done'); });
//     shoot.onError(function(e) { logger.debug('SHOOT: error ' + e)});
//     shoot.onCancel(function() { logger.debug('SHOOT: canceled')});
//     shoot.start({});

//     /*    var status = getConnectionValue("CCD Simulator", 'CONNECTION');

//         if (status == 'Off') {
//         }

//         connection.wait(function() {
//             return connection.properties['CONNECTION'].$$ == 'On';
//         }).then(function() {
//             logger.debug('connected !\n');
//         });*/


//     var infinite = connection.wait(function() {logger.debug('checking dummy cond'); return false});
//     infinite.onCancel(function() { logger.debug('canceled !') });

//     infinite = new Promises.Timeout(5000.0, infinite);
//     infinite.onError(logger.warn);
//     infinite.start({});





//     /*  logger.debug('testing');
//       parser.write('<dummystartup>');

//       logger.debug('test ok');

//       var xml = "<start><a>plop</a><b>glop</b>\n";


//       parser.write(xml);
//       parser.write("<c>\n");
//       parser.write("coucou</c>");
//     */
// }

export function timestampToEpoch(v:string):number
{
    var values = v.match(/^([0-9]+)-([0-9]+)-([0-9]+)T([0-9]+):([0-9]+):([0-9]+)$/);
    if (!values) {
        throw new Error("Invalid timestamp: " + v);
    }

    var d = Date.UTC(parseInt(values[1]),
                parseInt(values[2]) - 1,
                parseInt(values[3]),
                parseInt(values[4]),
                parseInt(values[5]),
                parseInt(values[6]));
    return d / 1000.0;
}

export const DriverInterface = {
    TELESCOPE: (1 << 0),  /**< Telescope interface, must subclass INDI::Telescope */
    CCD:       (1 << 1),  /**< CCD interface, must subclass INDI::CCD */
    GUIDER:    (1 << 2),  /**< Guider interface, must subclass INDI::GuiderInterface */
    FOCUSER:   (1 << 3),  /**< Focuser interface, must subclass INDI::FocuserInterface */
    FILTER:    (1 << 4),  /**< Filter interface, must subclass INDI::FilterInterface */
    DOME:      (1 << 5),  /**< Dome interface, must subclass INDI::Dome */
    GPS:       (1 << 6),  /**< GPS interface, must subclass INDI::GPS */
    WEATHER:   (1 << 7),  /**< Weather interface, must subclass INDI::Weather */
    AO:        (1 << 8),  /**< Adaptive Optics Interface */
    DUSTCAP:   (1 << 9),  /**< Dust Cap Interface */
    LIGHTBOX:  (1 << 10), /**< Light Box Interface */
    DETECTOR:  (1 << 11), /**< Detector interface, must subclass INDI::Detector */
    AUX:       (1 << 15), /**< Auxiliary interface */
}

function timestampDiff(a:string, b:string):number
{
    return timestampToEpoch(a) - timestampToEpoch(b);
}
