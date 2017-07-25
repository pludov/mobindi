import React, { Component } from 'react';
import PhdView from './PhdView';


class PhdApp {

    constructor(storeManager) {
        this.storeManager = storeManager;
    }

    getAppId() {
        return "phd";
    }

    getUi() {
        return <PhdView storeManager={this.storeManager}></PhdView>;
    }
}

export default PhdApp;