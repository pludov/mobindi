import * as React from 'react';
import BaseApp from './BaseApp';
import CameraView from './CameraView';

class CameraApp extends BaseApp {

    constructor() {
        super("camera");
    }

    getUi() {
        return (<div className="Page" key={this.appId}>
                    <CameraView />
                </div>);
    }
}

export default CameraApp;