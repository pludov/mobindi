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

        this.declareActions({
            switchToDevice : this.switchToDevice.bind(this),
            setGroupState: this.setGroupState.bind(this)
        });
    }

    getUi() {
        var self = this;

        return <IndiManagerView app={self}></IndiManagerView>;
    }

    setGroupState(state, dev, group, onoff) {
        var result = update(state, {
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
        console.log('WTF indiManager status is now '+ JSON.stringify(result.indiManager, null, 2));
        return result;
    }


    switchToDevice(state, dev) {
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

        return update(state, u);
    }
}

export default IndiManagerApp;