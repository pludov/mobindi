import React, { Component } from 'react';
import BaseApp from './BaseApp';
import PhdView from './PhdView';


class PhdApp extends BaseApp {

    constructor() {
        super("phd");
    }

    getUi() {
        return <PhdView key={this.appId}></PhdView>;
    }
}

export default PhdApp;