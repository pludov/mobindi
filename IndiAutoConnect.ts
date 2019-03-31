import CancellationToken from 'cancellationtoken';
import IndiManager from './IndiManager';

function debug(...args:any[]) {
    console.log('IndiAutoConnect: ' + args.map((e)=>''+e).join(' '));
}


// Evaluate f function, but if fail, return def
function noErr<T>(f:()=>T, def: T)
{
    try  {
        return f();
    } catch(e) {
        return def;
    }
}


export default class IndiAutoConnect {
    // Device => connectattempted
    memory:{[id:string]:boolean} = {};
    indiManager: IndiManager;

    constructor(indiManager:IndiManager) {
        this.indiManager = indiManager;

        // Change of the config flag for any will trigger recompute
        indiManager.appStateManager.addSynchronizer(['indiManager', 'configuration', 'indiServer', 'devices', null, 'options', 'autoConnect'],
                                                this.check, false);

        indiManager.appStateManager.addSynchronizer(['indiManager', 'deviceTree', null, 'CONNECTION', 'childs', 'CONNECT'],
                                                this.check, false);
        // Any change of the connection status will trigger recompute

    }

    private check=()=>{
        // Check all the devices with flag set to true
        // if connection status is :
        //    - missing or idle (connected), clear the memory
        //    - busy, set the memory to done
        //    - idle disconnected, connect
        // Remove the unknown devices from the memory
        debug('Recheck');
        const configDevices = noErr(()=>this.indiManager.currentStatus.configuration.indiServer.devices, undefined) || {};

        const configuredDevices:{[id:string]:boolean} = {};

        for(let devId of Object.keys(configDevices))
        {
            const dev = configDevices[devId];
            if (!noErr(()=>dev.options.autoConnect, "")) {
                continue;
            }
            debug('Configured device:', devId);
            configuredDevices[devId] = true;
        }

        const unseenDevices = {...this.memory};

        if (this.indiManager.connection) {
            const c = this.indiManager.connection;

            const deviceIds = c.getAvailableDeviceIdsWith(['CONNECTION']);

            debug('valid devices = ', JSON.stringify(deviceIds));
            for(let devId of deviceIds) {
                debug('What about', devId);
                if (!Object.prototype.hasOwnProperty.call(configuredDevices, devId)) {
                    debug('Not configured');
                    continue;
                }
                delete(unseenDevices[devId]);

                // Check the connection state of the device
                // Take memory state from the state of the connection vector
                const memoryState = Object.prototype.hasOwnProperty.call(this.memory, devId) ? this.memory[devId] : null;
                debug('Memory state is ', memoryState);
                if (memoryState === true) {
                    continue;
                }

                const vector = c.getDevice(devId).getVector('CONNECTION');
                if (vector.getState() === 'Busy') {
                    debug('connection is busy');
                    this.memory[devId] = true;
                    continue;
                }
                const val = vector.getPropertyValueIfExists('CONNECT');
                debug('val is ', val);
                if (val === null) {
                    // Doesn't really exists...
                    unseenDevices[devId] = true;
                    continue;
                }

                this.memory[devId] = true;
                if (val === 'Off') {
                    (async ()=> {
                        try {
                            debug('Starting...');
                            await this.indiManager.connectDevice(CancellationToken.CONTINUE, devId);
                        } catch(e) {
                            debug('Failed to autostart ' + devId, e);
                        }
                    })();
                }
            }
        }

        for(let devId of Object.keys(unseenDevices)) {
            debug('Forget about ', devId);
            delete this.memory[devId];
        }
    }
}
