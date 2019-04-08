import * as React from 'react';
import BaseApp from './BaseApp';
import ToolExecuterView from './ToolExecuterView';
import * as Store from './Store';

export default class ToolsApp extends BaseApp {

    constructor(storeManager: Store.StoreManager) {
        super(storeManager, "toolExecuter");
    }

    getUi() {
        var self = this;
        return (<div className="Page" key={self.appId}>
                    <ToolExecuterView />
                </div>);
    }
}
