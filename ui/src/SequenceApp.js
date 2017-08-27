import React, { Component, PureComponent} from 'react';
import BaseApp from './BaseApp';
import SequenceView from './SequenceView';
import {fork} from './Store.js';



class SequenceApp extends BaseApp {

    constructor(storeManager) {
        super(storeManager, "sequence");
        storeManager.addAdjuster(store=> (fork(store, ['sequence', 'currentImage'], (u)=>(u === undefined ? null : u))));

        storeManager.addActions("sequence", {
            setCurrentImage:
                (store, imageUid) =>
                    (fork(store, ['sequence', 'currentImage'], (u)=>(imageUid)))
            }
        );
    }

    getUi() {
        var self = this;
        return (<div className="Page" key={self.appId}>
                    <SequenceView app={self} />
                </div>);
    }
}

export default SequenceApp;