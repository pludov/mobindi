import React, { Component, PureComponent} from 'react';
import BaseApp from './BaseApp';
import FocuserView from './FocuserView';

class FocuserApp extends BaseApp {

    constructor() {
        super("focuser");
    }

    getUi() {
        return (<FocuserView key={this.appId} />);
    }
}

export default FocuserApp;