import * as Utils from './Utils';


function getDeviceDesc(store, device)
{
    try {
        return store.backend.indiManager.deviceTree[device];
    } catch(e) {
        return undefined;
    }
    
}

export {getDeviceDesc};