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
}

export default BaseApp;