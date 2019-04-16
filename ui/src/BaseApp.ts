import * as Store from './Store';
import { update } from './shared/Obj'
import * as React from 'react';


/**
 * Created by ludovic on 25/07/17.
 */
export default class BaseApp {
    readonly storeManager: Store.StoreManager;
    readonly appId: string;

    constructor(storeManager:Store.StoreManager, appId: string) {
        this.storeManager = storeManager;
        this.appId = appId;
    }

    bindStoreFunction(fn:(store:Store.Content, ...rest: any)=>Store.Content, fnname:string)
    {
        this.storeManager.addActions(this.appId, {
            [fnname]: fn
        });
        return (...invocationArgs:any)=> {
            return this.dispatchAction(fnname, invocationArgs)
        };
    }

    getAppId() {
        return this.appId;
    }

    // WTF. Go away !
    dispatchAction(method:string, args:any) {
        if (!args) args = [];
        this.storeManager.dispatch({
            type: "appAction",
            app: this.appId,
            method: method,
            args: args
        });
    }


    getUi():null|React.ReactNode {
        return null;
    }
}
