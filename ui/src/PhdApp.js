import React, { Component } from 'react';
import BaseApp from './BaseApp';
import PhdView from './PhdView';


class PhdApp extends BaseApp {

    constructor(storeManager) {
        super(storeManager, "phd");
    }

    getUi() {
        var self = this;
        return <PhdView app={self} key={self.appId}></PhdView>;
    }
}

export default PhdApp;