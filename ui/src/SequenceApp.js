import React, { Component, PureComponent} from 'react';
import BaseApp from './BaseApp';
import SequenceView from './SequenceView';
import {fork} from './Store';
import * as Utils from './Utils';
import * as Promises from './shared/Promises';


class SequenceApp extends BaseApp {

    constructor(storeManager) {
        super(storeManager, "sequence");
        storeManager.addAdjuster(store=> (fork(store, ['sequence', 'currentImage'], (u)=>(u === undefined ? null : u))));

        storeManager.addAdjuster(store=>(fork(store, ['sequence', 'currentSequence'], (u)=>(Utils.noErr(()=>store.backend.camera.sequences.byuuid[u]) === undefined ? null: u))));
        storeManager.addAdjuster(store=>(fork(store, ['sequence', 'currentSequenceEdit'], (u)=>(Utils.noErr(()=>store.backend.camera.sequences.byuuid[u]) === undefined ? null: u))));

        this.setCurrentImage = this.bindStoreFunction(this.setCurrentImage, "setCurrentImage");
        this.setCurrentSequence = this.bindStoreFunction(this.setCurrentSequence, "setCurrentSequence");
        this.setCurrentSequenceAndEdit = this.bindStoreFunction(this.setCurrentSequenceAndEdit, "setCurrentSequenceAndEdit");
        this.editCurrentSequence = this.bindStoreFunction(this.editCurrentSequence, "editCurrentSequence");
        this.closeSequenceEditor = this.bindStoreFunction(this.closeSequenceEditor, "closeSequenceEditor");
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
        if (currentSequence == undefined) return $store;
        return fork($store, ['sequence', 'currentSequenceEdit'], ()=>currentSequence);
    }

    // Returns a promise that produce an uid
    async newSequenceStep(sequenceUid) {
        return await this.appServerRequest('camera', {method: 'newSequenceStep', sequenceUid: sequenceUid});
    }

    async deleteSequenceStep(sequenceUid, sequenceStepUid) {
        return await this.appServerRequest('camera', {
            method: 'deleteSequenceStep', 
            sequenceUid: sequenceUid, 
            sequenceStepUid: sequenceStepUid
        });
    }

    async moveSequenceSteps(sequenceUid, sequenceStepUidList) {
        return await this.appServerRequest('camera', {
            method: 'moveSequenceSteps', 
            sequenceUid: sequenceUid,
            sequenceStepUidList: sequenceStepUidList
        });
    }

    async updateSequenceParam(sequenceUid, params) {
        const args = Object.assign({
            method:'updateSequenceParam',
            sequenceUid: sequenceUid
        }, params);

        return await this.appServerRequest('camera', args);
    }

    closeSequenceEditor($store) {
        return fork($store, ['sequence', 'currentSequenceEdit'], ()=>undefined);
    }

    async newSequence() {
        const uid = await this.appServerRequest('camera', {
                method: 'newSequence'
            });
        
        console.log('WTF new sequence: '+ uid);
        self.setCurrentSequenceAndEdit(uid);
    }

    // Returns a promise
    async startSequence(sequenceUid) {
        return await this.appServerRequest('camera', {
            method: 'startSequence',
            key: sequenceUid
        });
    }

    async stopSequence(sequenceUid) {
        return await this.appServerRequest('camera', {
            method: 'stopSequence',
            key: sequenceUid
        });
    }

    async dropSequence(sequenceUid) {
        console.log('drop sequence');
        return await this.appServerRequest('camera', {
            method: 'dropSequence',
            key: sequenceUid
        });
    }

    async resetSequence(sequenceUid) {
        console.log('reset sequence');
        return await this.appServerRequest('camera', {
            method: 'resetSequence',
            key: sequenceUid
        });
    }

    getUi() {
        return (<div className="Page" key={this.appId}>
                    <SequenceView app={this} />
                </div>);
    }
}

export default SequenceApp;