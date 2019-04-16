import React, { Component, PureComponent} from 'react';
import BaseApp from './BaseApp';
import FocuserView from './FocuserView';
import { StoreManager } from './Store';


class FocuserApp extends BaseApp {

    constructor(storeManager: StoreManager) {
        super(storeManager, "focuser");
    }

    getUi() {
        var self = this;
        return (<FocuserView key={self.appId} />);
    }
}

export default FocuserApp;