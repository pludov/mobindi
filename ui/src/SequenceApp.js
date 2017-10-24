import React, { Component, PureComponent} from 'react';
import BaseApp from './BaseApp';
import SequenceView from './SequenceView';
import {fork} from './Store.js';
import * as Utils from './Utils';
import * as Promises from './shared/Promises';


class SequenceApp extends BaseApp {

    constructor(storeManager) {
        super(storeManager, "sequence");
        storeManager.addAdjuster(store=> (fork(store, ['sequence', 'currentImage'], (u)=>(u === undefined ? null : u))));

        storeManager.addAdjuster(store=>(fork(store, ['sequence', 'currentEditSequence'], (u)=>(Utils.noErr(()=>store.backend.camera.sequences.byUuid[u]) === undefined ? null: u))));

        this.bindStoreFunction(this.setCurrentImage);
        this.bindStoreFunction(this.setCurrentSequence);
        this.bindStoreFunction(this.setCurrentSequenceAndEdit);
        this.bindStoreFunction(this.editCurrentSequence);
        this.bindStoreFunction(this.closeSequenceEditor);
    }

    setCurrentImage($store, imageUid) {
        return fork($store, ['sequence', 'currentImage'], (u)=>(imageUid));
    }

    setCurrentSequence($store, sequenceUid) {
        return fork($store, ['sequence', 'currentSequence'], (u)=>(sequenceUid));
    }

    setCurrentSequenceAndEdit($store, sequenceUid) {
        return fork(fork($store,
                 ['sequence', 'currentSequence'], (u)=>(sequenceUid)),
                 ['sequence', 'currentSequenceEdit'], (u)=>(sequenceUid));
    }

    // Dispatch to store
    editCurrentSequence($store) {
        var currentSequence=$store.sequence.currentSequence;
        console.log('WTF pre switching currentSequence to ' + currentSequence);
        if (currentSequence == undefined) return $store;
        console.log('WTF switching currentSequence to ' + currentSequence);
        return fork($store, ['sequence', 'currentSequenceEdit'], ()=>currentSequence);
    }

    // Returns a promise
    updateSequenceParam(sequenceUid, params) {
        var args = Object.assign({
            method:'updateSequenceParam',
            sequenceUid: sequenceUid
        }, params);

        return this.appServerRequest('camera', args);
    }

    closeSequenceEditor($store) {
        return fork($store, ['sequence', 'currentSequenceEdit'], ()=>undefined);
    }

    newSequence() {
        var self = this;
        return new Promises.Chain(
            this.appServerRequest('camera', {
                method: 'newSequence'
            }),
            new Promises.Immediate((uid)=> {
                console.log('WTF new sequence: '+ uid);
                self.setCurrentSequenceAndEdit(uid);
            }));
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