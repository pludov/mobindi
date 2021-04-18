import React, { Component, PureComponent} from 'react';
import * as Help from './Help';
import BaseApp from './BaseApp';
import FocuserView from './FocuserView';
import * as FocuserStore from './FocuserStore';

class FocuserApp extends BaseApp {
    static help = Help.key("Focuser", "Automated focusing tool");

    constructor() {
        super("focuser", FocuserApp.help);
    }

    getUi() {
        return (<FocuserView key={this.appId} imagingSetupIdAccessor={FocuserStore.currentImagingSetupAccessor()}/>);
    }
}

export default FocuserApp;