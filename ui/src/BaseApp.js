import { notifier } from './Store';

/**
 * Created by ludovic on 25/07/17.
 */
class BaseApp {

    constructor(storeManager, appId) {
        this.storeManager = storeManager;
        this.appId = appId;
        this.dispatchAction = this.dispatchAction.bind(this);
    }

    declareActions(obj) {
        this.storeManager.addActions(this.appId, obj);
    }

    getAppId() {
        return this.appId;
    }

    dispatchAction(method) {
        this.storeManager.dispatch({
            type: "appAction",
            app: this.getAppId(),
            method: method,
            args: Array.from(arguments).slice(1)
        });
    }

    // Returns a promise that will execute the request
    // Except an object with at least method property
    // will call a $api_ method on server side
    serverRequest(content) {
        return notifier.sendRequest(Object.assign({'target': this.appId}, content));
    }
}

export default BaseApp;