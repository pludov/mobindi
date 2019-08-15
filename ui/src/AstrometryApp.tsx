import React, { Component, PureComponent} from 'react';
import BaseApp from './BaseApp';
import ScopeView from './ScopeView';


export default class AstrometryApp extends BaseApp {
    constructor() {
        super("astrometry");
    }

    getUi() {
        return (<div className="Page" key={this.appId}>
                    <ScopeView />
                </div>);
    }
}