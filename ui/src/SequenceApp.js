import React, { Component, PureComponent} from 'react';
import BaseApp from './BaseApp';
import SequenceView from './SequenceView';
import {fork} from './Store.js';



class SequenceApp extends BaseApp {

    constructor(storeManager) {
        super(storeManager, "sequence");
        storeManager.addAdjuster(store=> (fork(store, ['sequence', 'currentImage'], (u)=>(u === undefined ? null : u))));

        this.bindStoreFunction(this.setCurrentImage);
        this.bindStoreFunction(this.setCurrentSequence);
    }

    setCurrentImage($store, imageUid) {
        return fork($store, ['sequence', 'currentImage'], (u)=>(imageUid));
    }

    setCurrentSequence($store, sequenceUid) {
        return fork($store, ['sequence', 'currentSequence'], (u)=>(sequenceUid));
    }

    // Returns a promise
    startSequence(sequenceUid) {
        return this.appServerRequest('camera', {
            method: 'startSequence',
            key: sequenceUid
        });
    }

    stopSequence(sequenceUid) {
        return this.appServerRequest('camera', {
            method: 'stopSequence',
            key: sequenceUid
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