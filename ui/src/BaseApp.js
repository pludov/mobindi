import * as Store from './Store';
import { update } from './shared/Obj'

/**
 * Created by ludovic on 25/07/17.
 */
class BaseApp {

    constructor(storeManager, appId) {
        this.storeManager = storeManager;
        this.appId = appId;
        this.setViewerState = this.bindStoreFunction(this.setViewerState, "setViewerState");
    }

    declareActions(obj) {
        this.storeManager.addActions(this.appId, obj);
    }

    bindStoreFunction(fn, fnname)
    {
        var self = this;
        this.storeManager.addActions(this.appId, {
            [fnname]: fn
        });
        return function() {
            var invocationArgs = Array.from(arguments);
            return self.dispatchAction(fnname, invocationArgs)
        };
    }

    getAppId() {
        return this.appId;
    }

    dispatchAction(method, args) {
        if (!args) args = [];
        this.storeManager.dispatch({
            type: "appAction",
            app: this.appId,
            method: method,
            args: args
        });
    }

    setViewerState($state, context, viewSettings) {
        console.log('WTF: save context ' , context, ' parameters to ', viewSettings);
        var result = update($state, {
            $mergedeep: {
                viewSettings: {
                    [context]: viewSettings
                }
            }
        });
        return result;
    }

    getViewerState(store, context)
    {
        try {
            return store.viewSettings[context];
        }catch(error) {
            return undefined;
        }
    }

    // Send a request to any server side app.
    // Returns a promise that will execute the request
    // Except an object with at least method property
    // will call a $api_ method on server side
    appServerRequest(appId, content) {
        return (Store.getNotifier().sendRequest(Object.assign({'target': appId}, content))
                    .onCancel(()=>{console.log('request canceled')})
                    .onError((e)=>{console.log('Request error:', e)}));
    }

    // Send a request to the server side app counterpart
    // Returns a promise that will execute the request
    // Except an object with at least method property
    // will call a $api_ method on server side
    serverRequest(content) {
        return this.appServerRequest(this.appId, content);
    }
}

export default BaseApp;