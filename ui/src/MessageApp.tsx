import React, { Component, PureComponent} from 'react';
import BaseApp from './BaseApp';
import MessageView from './MessageView';


class MessageApp extends BaseApp {

    constructor() {
        super("messages");
    }

    getUi() {
        var self = this;
        return (<div className="Page" key={self.appId}>
                    <MessageView />
                </div>);
    }
}

export default MessageApp;