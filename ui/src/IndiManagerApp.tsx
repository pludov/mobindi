/**
 * Created by ludovic on 25/07/17.
 */
import * as React from 'react';
import * as Store from "./Store";
import BaseApp from './BaseApp';
import IndiManagerView from './indiview/IndiManagerView';



class IndiManagerApp extends BaseApp {

    constructor(storeManager:Store.StoreManager) {
        super(storeManager, "indiManager");
    }

    getUi() {
        var self = this;

        return <IndiManagerView key={self.appId}></IndiManagerView>;
    }
}

export default IndiManagerApp;