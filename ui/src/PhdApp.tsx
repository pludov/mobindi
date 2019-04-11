import React, { Component } from 'react';
import BaseApp from './BaseApp';
import * as Store from "./Store";
import PhdView from './PhdView';


class PhdApp extends BaseApp {

    constructor(storeManager: Store.StoreManager) {
        super(storeManager, "phd");
    }

    getUi() {
        return <PhdView key={this.appId}></PhdView>;
    }
}

export default PhdApp;