/**
 * Created by ludovic on 25/07/17.
 */
import React, { Component } from 'react';
import { update } from './shared/Obj'
import BaseApp from './BaseApp';
import IndiManagerView from './IndiManagerView';



class IndiManagerApp extends BaseApp {

    constructor(storeManager) {
        super(storeManager, "indiManager");
        this.switchToDevice = this.bindStoreFunction(this.switchToDevice, "switchToDevice");
        this.setGroupState = this.bindStoreFunction(this.setGroupState, "setGroupState");
    }

    getUi() {
        var self = this;

        return <IndiManagerView app={self} key={self.appId}></IndiManagerView>;
    }

    setGroupState($state, dev, group, onoff) {
        console.log('WTF: switch to device ' + dev + ' => ' + onoff);
        var result = update($state, {
            $mergedeep: {
                indiManager: {
                    expandedGroups: {
                        [dev]: {
                            [group]: onoff
                        }
                    }
                }
            }
        });
        return result;
    }

    switchToDevice($state, dev) {
        var emptyDev = {};
        emptyDev[dev] = {};
        var u = {
            $mergedeep: {
                indiManager: {
                    selectedDevice: dev,
                    expandedGroups: {
                        [dev]: {}
                    }
                }
            }
        };

        return update($state, u);
    }

    // Returns a promise that needs start
    async restartDriver(driver) {
        return await this.serverRequest({
            method: 'restartDriver',
            driver: driver
        });
    }

    async updateDriverParam(driver, key, value) {
        return await this.serverRequest({
            method: 'updateDriverParam',
            driver,
            key,
            value
        });
    }
    
    // Returns a promise that needs start
    async rqtSwitchProperty(desc) {
        return await this.serverRequest({
            method: 'setProperty',
            data: desc
        });
    }
}

export default IndiManagerApp;