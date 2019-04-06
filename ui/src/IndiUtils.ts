import * as Store from './Store';

export function getDeviceDesc(store:Store.Content, device:string)
{
    try {
        return store.backend.indiManager!.deviceTree[device];
    } catch(e) {
        return undefined;
    }
}

export function timestampToDate(timestamp:string):Date
{
    return new Date(timestamp + "Z");
}
