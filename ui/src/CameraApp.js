import React, { Component, PureComponent} from 'react';
import BaseApp from './BaseApp';
import CameraView from './CameraView';


class CameraApp extends BaseApp {

    constructor(storeManager) {
        super(storeManager, "camera");
    }

    getUi() {
        var self = this;
        return (<div className="Page" key={self.appId}>
                    <CameraView app={self} />
                </div>);
    }
}

export default CameraApp;