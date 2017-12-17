import { notifier } from './Store';

/**
 * Created by ludovic on 25/07/17.
 */
class BaseApp {

    constructor(storeManager, appId) {
        this.storeManager = storeManager;
        this.appId = appId;
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

    // Send a request to any server side app.
    // Returns a promise that will execute the request
    // Except an object with at least method property
    // will call a $api_ method on server side
    appServerRequest(appId, content) {
        return (notifier.sendRequest(Object.assign({'target': appId}, content))
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