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

    // setGroupState($state, dev, group, onoff) {
    //     console.log('WTF: switch to device ' + dev + ' => ' + onoff);
    //     var result = update($state, {
    //         $mergedeep: {
    //             indiManager: {
    //                 expandedGroups: {
    //                     [dev]: {
    //                         [group]: onoff
    //                     }
    //                 }
    //             }
    //         }
    //     });
    //     return result;
    // }

    // // Returns a promise that needs start
    // async restartDriver(driver) {
    //     return await this.serverRequest({
    //         method: 'restartDriver',
    //         driver: driver
    //     });
    // }

    // async updateDriverParam(driver, key, value) {
    //     return await this.serverRequest({
    //         method: 'updateDriverParam',
    //         driver,
    //         key,
    //         value
    //     });
    // }
    
    // // Returns a promise that needs start
    // async rqtSwitchProperty(desc) {
    //     return await this.serverRequest({
    //         method: 'setProperty',
    //         data: desc
    //     });
    // }
}

export default IndiManagerApp;