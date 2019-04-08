import React, { Component, PureComponent} from 'react';
import BaseApp from './BaseApp';
import AstrometryView from './AstrometryView';
import * as BackendRequest from "./BackendRequest";


export default class AstrometryApp extends BaseApp {
    constructor(storeManager: any) {
        super(storeManager, "astrometry");
    }

    getUi() {
        return (<div className="Page" key={this.appId}>
                    <AstrometryView app={this} />
                </div>);
    }
}