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

    // Send a request to any server side app.
    // Returns a promise that will execute the request
    // Except an object with at least method property
    // will call a $api_ method on server side
    async appServerRequest(appId:string, content:any): Promise<any> {
        try {
            const ret = Store.getNotifier().sendRequest(Object.assign({'target': appId}, content));
            return ret;
        } catch(e) {
            console.log('Request to ' + appId + ' error:', e);
            throw e;
        }
    }

    // Send a request to the server side app counterpart
    // Returns a promise that will execute the request
    // Except an object with at least method property
    // will call a $api_ method on server side
    serverRequest(content:any) {
        return this.appServerRequest(this.appId, content);
    }
}
