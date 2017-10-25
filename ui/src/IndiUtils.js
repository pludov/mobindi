import * as Utils from './Utils';


function getDeviceDesc(store, device)
{
    try {
        console.log("WTF: here!");
        console.log("WTF keys: ", Object.keys(store.backend.indiManager.deviceTree));
        return store.backend.indiManager.deviceTree[device];
    } catch(e) {
        console.error("WTF error", e);
        return undefined;
    }
    
}

export {getDeviceDesc};