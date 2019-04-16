import * as React from 'react';
import BaseApp from './BaseApp';
import * as Store from './Store';
import SequenceView from './Sequence/SequenceView';


class SequenceApp extends BaseApp {

    constructor(storeManager:Store.StoreManager) {
        super(storeManager, "sequence");
    }

    getUi() {
        return (<div className="Page" key={this.appId}>
                    <SequenceView />
                </div>);
    }
}

export default SequenceApp;