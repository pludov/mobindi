import * as React from 'react';
import BaseApp from './BaseApp';
import SequenceView from './Sequence/SequenceView';


class SequenceApp extends BaseApp {

    constructor() {
        super("sequence");
    }

    getUi() {
        return (<div className="Page" key={this.appId}>
                    <SequenceView />
                </div>);
    }
}

export default SequenceApp;