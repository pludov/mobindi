import React, { Component, PureComponent} from 'react';
import BaseApp from './BaseApp';
import FocuserView from './FocuserView';


class FocuserApp extends BaseApp {

    constructor(storeManager) {
        super(storeManager, "focuser");
    }

    getUi() {
        var self = this;
        return (<FocuserView key={self.appId} app={self} />);
    }
}

export default FocuserApp;