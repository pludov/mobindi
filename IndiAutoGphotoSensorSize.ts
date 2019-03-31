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


const targetVector = 'CCD_INFO';
const defaultValues = {
    CCD_MAX_X: "16000",
    CCD_MAX_Y: "9000",
    CCD_PIXEL_SIZE: "10",
    CCD_PIXEL_SIZE_X: "10",
    CCD_PIXEL_SIZE_Y: "10",
    CCD_BITSPERPIXEL: "16"
}

export default class IndiAutoGphotoSensorSize {
    // Device => connectattempted
    memory:{[id:string]:boolean} = {};
    private readonly indiManager: IndiManager;

    constructor(indiManager:IndiManager) {
        this.indiManager = indiManager;

        // Change of the config flag for any will trigger recompute
        indiManager.appStateManager.addSynchronizer(['indiManager', 'configuration', 'indiServer', 'devices', null, 'options', 'autoGphotoSensorSize'],
                                                this.check, false);

        // Any change of the connection status will trigger recompute
        indiManager.appStateManager.addSynchronizer(['indiManager', 'deviceTree', null, 'CONNECTION', 'childs', 'CONNECT'],
                                                this.check, false);

        indiManager.appStateManager.addSynchronizer(['indiManager', 'deviceTree', null, targetVector],
                                                this.check, false);
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
            if (!noErr(()=>dev.options.autoGphotoSensorSize, undefined)) {
                continue;
            }
            debug('Configured device:', devId);
            configuredDevices[devId] = true;
        }

        const unseenDevices = {...this.memory};

        if (this.indiManager.connection) {
            const c = this.indiManager.connection;

            const deviceIds = c.getAvailableDeviceIdsWith([targetVector]);

            debug('valid devices = ', JSON.stringify(deviceIds));
            for(let devId of deviceIds) {
                debug('What about', devId);
                if (!Object.prototype.hasOwnProperty.call(configuredDevices, devId)) {
                    debug('Not configured');
                    continue;
                }

                // Check the connection state
                const connVector = c.getDevice(devId).getVector('CONNECTION');
                if (!connVector.exists()) {
                    debug('CONNECTION does not exists');
                    continue;
                }

                if (connVector.getState() === 'Busy') {
                    debug('CONNECTION is busy');
                    continue;
                }

                if (connVector.getPropertyValueIfExists('CONNECT') !== 'On') {
                    debug('CONNECTION NOT On');
                    continue;
                }

                // Check the target vector
                delete(unseenDevices[devId]);

                const vector = c.getDevice(devId).getVector(targetVector);
                if (vector.getState() === 'Busy') {
                    debug(targetVector, 'is busy');
                    continue;
                }
                
                const values = Object.keys(defaultValues).sort().map(k=>{
                    const strValue = vector.getPropertyValueIfExists(k);
                    return strValue === null ? null : parseFloat(strValue);
                });
                debug('Current values:', JSON.stringify(values));

                if (values.filter(e=>(e!==0 && e !== null)).length === 0) {
                    debug('Values are fine');
                    continue;
                }
                
                // Check the connection state of the device
                // Take memory state from the state of the connection vector
                const memoryState = Object.prototype.hasOwnProperty.call(this.memory, devId) ? this.memory[devId] : null;
                debug('Memory state is ', memoryState);
                if (memoryState === true) {
                    continue;
                }

                this.memory[devId] = true;
                
                (async ()=> {
                    try {
                        debug('Starting...');
                        await this.indiManager.setParam(CancellationToken.CONTINUE, devId, targetVector, defaultValues, true);
                    } catch(e) {
                        debug('Ignoring set size error', e);
                    }
                })();
            }
        }

        for(let devId of Object.keys(unseenDevices)) {
            debug('Forget about ', devId);
            delete this.memory[devId];
        }
    }
}
