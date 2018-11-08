
function debug() {
    console.log('IndiAutoGphotoSensorSize: ' + Array.from(arguments).map((e)=>''+e).join(' '));
}


// Evaluate f function, but if fail, return def
function noErr(f, def)
{
    try  {
        return f();
    } catch(e) {
        return def;
    }
}

const targetVector = 'CCD_INFO';
const defaultValues = {
    CCD_MAX_X: 16000,
    CCD_MAX_Y: 9000,
    CCD_PIXEL_SIZE: 10,
    CCD_PIXEL_SIZE_X: 10,
    CCD_PIXEL_SIZE_Y: 10,
    CCD_BITSPERPIXEL: 16
}

class IndiAutoGphotoSensorSize {
    // Device => connectattempted
    memory = {};

    constructor(indiManager) {
        this.indiManager = indiManager;
        this.check = this.check.bind(this);

        // Change of the config flag for any will trigger recompute
        indiManager.appStateManager.addSynchronizer(['indiManager', 'configuration', 'indiServer', 'devices', null, 'options', 'autoGphotoSensorSize'],
                                                this.check);

        // Any change of the connection status will trigger recompute
        indiManager.appStateManager.addSynchronizer(['indiManager', 'deviceTree', null, 'CONNECTION', 'childs', 'CONNECT'],
                                                this.check);

        indiManager.appStateManager.addSynchronizer(['indiManager', 'deviceTree', null, targetVector],
                                                this.check);
    }

    check() {
        // Check all the devices with flag set to true
        // if connection status is :
        //    - missing or idle (connected), clear the memory
        //    - busy, set the memory to done
        //    - idle disconnected, connect
        // Remove the unknown devices from the memory
        debug('Recheck');
        const configDevices = noErr(()=>this.indiManager.currentStatus.configuration.indiServer.devices) || {};

        const configuredDevices = {};

        for(let devId of Object.keys(configDevices))
        {
            const dev = configDevices[devId];
            if (!noErr(()=>dev.options.autoGphotoSensorSize)) {
                continue;
            }
            debug('Configured device:', devId);
            configuredDevices[devId] = true;
        }

        const unseenDevices = {...this.memory};

        if (this.indiManager.connection) {
            const c = this.indiManager.connection;

            const deviceIds = c.getAvailableDeviceIds([targetVector]);

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
                
                const values = Object.keys(defaultValues).sort().map(k=>parseFloat(vector.getPropertyValueIfExists(k)));
                debug('Current values:', JSON.stringify(values));

                if (values.filter(e=>(e!=='0' && e !== null)).length === 0) {
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
                
                try {
                    debug('Starting...');
                    this.indiManager.setParam(devId, targetVector, defaultValues, true)
                        .onError((e)=>{debug('Failed to set size ' + devId, e)})
                        .start();
                } catch(e) {
                    debug('Ignoring set size error', e);
                }
            }
        }

        for(let devId of Object.keys(unseenDevices)) {
            debug('Forget about ', devId);
            delete this.memory[devId];
        }
    }
}


module.exports = IndiAutoGphotoSensorSize;