import * as Store from './Store';
import { IndiDevice } from '@bo/BackOfficeStatus';

export function getDeviceDesc(store:Store.Content, device:string) : IndiDevice|undefined
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
