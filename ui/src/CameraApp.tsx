import * as React from 'react';
import * as Store from "./Store";
import BaseApp from './BaseApp';
import CameraView from './CameraView';

class CameraApp extends BaseApp {

    constructor(storeManager: Store.StoreManager) {
        super(storeManager, "camera");
    }

    getUi() {
        return (<div className="Page" key={this.appId}>
                    <CameraView app={this} />
                </div>);
    }
}

export default CameraApp;