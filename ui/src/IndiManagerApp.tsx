/**
 * Created by ludovic on 25/07/17.
 */
import * as React from 'react';
import BaseApp from './BaseApp';
import IndiManagerView from './indiview/IndiManagerView';

class IndiManagerApp extends BaseApp {

    constructor() {
        super("indiManager");
    }

    getUi() {
        return <IndiManagerView key={this.appId}></IndiManagerView>;
    }
}

export default IndiManagerApp;