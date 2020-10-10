import * as Store from './Store';
import { IndiDevice, IndiVector } from '@bo/BackOfficeStatus';
import { has } from './shared/JsonProxy';
import { getOwnProp } from './Utils';

export function getDeviceDesc(store:Store.Content, device:string) : IndiDevice|undefined
{
    return getOwnProp(store.backend.indiManager?.deviceTree, device);
}

export function getVectorDesc(store:Store.Content, device:string, vector: string) : IndiVector|undefined
{
    return getOwnProp(getDeviceDesc(store, device), vector);
}

export function timestampToDate(timestamp:string):Date
{
    return new Date(timestamp + "Z");
}
