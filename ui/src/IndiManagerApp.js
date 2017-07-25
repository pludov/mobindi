/**
 * Created by ludovic on 25/07/17.
 */
import React, { Component } from 'react';
import IndiManagerView from './IndiManagerView';

class IndiManagerApp {

    constructor(storeManager) {
        this.storeManager = storeManager;

        this.switchToDevice = this.switchToDevice.bind(this);
    }

    getAppId() {
        return "indiManager";
    }

    getUi() {
        var self = this;

        return <IndiManagerView app={self}></IndiManagerView>;
    }

    switchToDevice(dev) {
        this.storeManager.dispatchUpdate(
            {
                indiManager: {
                    $merge: {
                        selectedDevice: dev
                    }
                }
            });
    }
}

export default IndiManagerApp;