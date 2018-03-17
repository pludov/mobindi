import React, { Component, PureComponent} from 'react';
import BaseApp from './BaseApp';
import ToolExecuterView from './ToolExecuterView';
import { update } from './shared/Obj'
import { atPath } from './shared/JsonPath';


class ToolsApp extends BaseApp {

    constructor(storeManager) {
        super(storeManager, "toolExecuter");
    }

    getUi() {
        var self = this;
        return (<div className="Page" key={self.appId}>
                    <ToolExecuterView app={self} />
                </div>);
    }

    startTool(uid) {
        return this.serverRequest({
            method: 'startTool',
            uid: uid
        });
    }
}

export default ToolsApp;