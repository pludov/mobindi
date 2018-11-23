import React, { Component, PureComponent} from 'react';
import BaseApp from './BaseApp';
import CameraView from './CameraView';


class CameraApp extends BaseApp {

    constructor(storeManager) {
        super(storeManager, "camera");
    }

    getUi() {
        return (<div className="Page" key={this.appId}>
                    <CameraView app={this} />
                </div>);
    }
}

export default CameraApp;