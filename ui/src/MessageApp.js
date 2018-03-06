import React, { Component, PureComponent} from 'react';
import BaseApp from './BaseApp';
import MessageView from './MessageView';
import { update } from './shared/Obj'
import { atPath } from './shared/JsonPath';


// Add a unread message
class MessageAppSynchronizer {
    constructor() {
        this.currentApp = undefined;
        this.currentByUid = undefined;
    }

    adjuster() {
        var self = this;
        return (state) => {
            var newApp = state.currentApp === 'messages';
            var newByUid = atPath(state, '$.backend.indiManager.messages.byUid');

            if (newApp === self.currentApp && newByUid === self.currentByUid) {
                return state;
            }


            var uids = Object.keys(newByUid).sort();
            var current = uids.length ? uids[uids.length - 1] : undefined;
            if (newApp) {
                state = update(state, {$mergedeep: {
                    lastMessage: current,
                    lastMessageDisplayed: current,
                    appNotifications:
                    {
                        messages: undefined
                    }
                }});
            } else {
                var warning;
                if (state.lastMessageDisplayed === state.lastMessage) {
                    warning = undefined;
                } else {
                    // Count unread messages.
                    var previousId = state.lastMessageDisplayed;
                    var previousPos = uids.indexOf(previousId);
                    warning = {
                        text: "(" + (previousPos == -1 ? uids.length : uids.length - previousPos - 1) + ")",
                        className: "Warning"
                    }
                }
                state = update(state, {$mergedeep: {
                    lastMessage: current,
                    appNotifications:
                    {
                        messages: warning
                    }
                }});
            }

            self.currentApp = newApp;
            self.currentByUid = newByUid;

            return state;
        }
    }
}

class MessageApp extends BaseApp {

    constructor(storeManager) {
        super(storeManager, "messages");
        // Update lastMessage and lastMessage displayed
        storeManager.addAdjuster(new MessageAppSynchronizer().adjuster());
    }

    getUi() {
        var self = this;
        return (<div className="Page" key={self.appId}>
                    <MessageView app={self} />
                </div>);
    }
}

export default MessageApp;