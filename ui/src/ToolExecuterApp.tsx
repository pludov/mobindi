import * as React from 'react';
import BaseApp from './BaseApp';
import ToolExecuterView from './ToolExecuterView';

export default class ToolsApp extends BaseApp {

    constructor() {
        super("toolExecuter");
    }

    getUi() {
        return (<div className="Page" key={this.appId}>
                    <ToolExecuterView />
                </div>);
    }
}
