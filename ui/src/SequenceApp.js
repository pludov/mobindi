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
                    (fork(store, ['sequence', 'currentImage'], (u)=>(imageUid))),
                    
            setCurrentSequence:
                (store, sequenceUid) =>
                    (fork(store, ['sequence', 'currentSequence'], function(u){
                        console.log('WTF UPDATE CURRENT SEQ to ' + sequenceUid);
                        return sequenceUid;}))
        });
    }

    getUi() {
        var self = this;
        return (<div className="Page" key={self.appId}>
                    <SequenceView app={self} />
                </div>);
    }
}

export default SequenceApp;