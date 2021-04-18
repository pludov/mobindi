import * as React from 'react';
import * as Help from './Help';
import BaseApp from './BaseApp';
import CameraView from './CameraView';
import * as CameraStore from './CameraStore';

class CameraApp extends BaseApp {
    static help = Help.key("Camera", "Live control of cameras (settings, exposure)");

    constructor() {
        super("camera", CameraApp.help);
    }

    getUi() {
        return (<div className="Page" key={this.appId}>
                    <CameraView imagingSetupIdAccessor={CameraStore.currentImagingSetupAccessor()}/>
                </div>);
    }
}

export default CameraApp;