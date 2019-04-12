import React, { Component, PureComponent} from 'react';
import BaseApp from './BaseApp';
import * as Store from "./Store";
import MessageView from './MessageView';


class MessageApp extends BaseApp {

    constructor(storeManager: Store.StoreManager) {
        super(storeManager, "messages");
    }

    getUi() {
        var self = this;
        return (<div className="Page" key={self.appId}>
                    <MessageView />
                </div>);
    }
}

export default MessageApp;