import React, { Component, PureComponent} from 'react';
import BaseApp from './BaseApp';
import * as Help from './Help';
import MountView from './MountView';


export default class AstrometryApp extends BaseApp {
    static help = Help.key("Astrometry", "Use astrometry for telescope pointing and polar alignment");

    constructor() {
        super("astrometry", AstrometryApp.help);
    }

    getUi() {
        return (<div className="Page" key={this.appId}>
                    <MountView  />
                </div>);
    }
}