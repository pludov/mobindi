import React, { Component, PureComponent} from 'react';
import BaseApp from './BaseApp';
import SequenceView from './SequenceView';


class SequenceApp extends BaseApp {

    constructor(storeManager) {
        super(storeManager, "sequence");
    }

    getUi() {
        var self = this;
        return (<div className="Page" key={self.appId}>
                    <SequenceView app={self} />
                </div>);
    }
}

export default SequenceApp;