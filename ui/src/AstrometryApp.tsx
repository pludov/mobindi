import React, { Component, PureComponent} from 'react';
import BaseApp from './BaseApp';
import AstrometryView from './AstrometryView';


export default class AstrometryApp extends BaseApp {
    constructor() {
        super("astrometry");
    }

    getUi() {
        return (<div className="Page" key={this.appId}>
                    <AstrometryView />
                </div>);
    }
}