/**
 * Created by ludovic on 17/07/17.
 */


import * as BackendStore from './BackendStore';
import { Store } from 'redux';
import Notifier from './Notifier';
import * as Promises from './shared/Promises';

export type Content = BackendStore.Content & {
    currentApp: string|null;
    indiManager: {};
    appNotifications: {};
};

// Fork un état et des sous-objet (forcement des objets)
// Keep the state if no modif is implied
function fork(state:Content, path?:string[], fn?:(t:any)=>any)
{
    var orgState = state;
    state = Object.assign({}, state);
    if (path != undefined) {
        var current = state;
        for(var i = 0; i < path.length; ++i)
        {
            var key = path[i];

            if (i == path.length - 1 && fn !== undefined) {
                var prev = current[key];
                var nv = fn(prev);
                if (prev === nv) {
                    return orgState;
                }
                current[key] = nv;
            } else {
                if (current[key] === null || current[key] === undefined)
                {
                    current[key] = {};
                } else {
                    current[key] = Object.assign({}, current[key]);
                }
            }
            current = current[key];
        }
    }
    return state;
}

export type StoreManager = {
    dispatch:(e: Object)=>(void);
    dispatchUpdate: (e:Object)=>(void);
    sendRequest: (e:Object)=>Promises.Cancelable<any, any>;
}

let store:Store;
let notifier:Notifier;
let storeManager: StoreManager;

export function init(newStore:Store, newNotifier: Notifier, newStoreManager: StoreManager) {
    store = newStore;
    notifier = newNotifier;
    storeManager = newStoreManager;
}

export function getStore() {
    if (store === undefined) {
        throw new Error("Store not initialized");
    }
    return store;
}

export function getNotifier() {
    if (notifier === undefined) {
        throw new Error("Notifier not initialized");
    }
    return notifier;
}

export function getStoreManager() {
    if( storeManager === undefined) {
        throw new Error("Notifier not initialized");
    }
    return storeManager;
}

export { fork }
