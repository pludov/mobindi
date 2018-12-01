import React, { Component, PureComponent} from 'react';
import PropTypes from 'prop-types';
import { notifier, BackendStatus } from './Store';
import { connect } from 'react-redux';

import { atPath } from './shared/JsonPath';
import { timestampToDate } from './IndiUtils';

import './MessageView.css'

class Item extends PureComponent {
    constructor(props) {
        super(props);
    }

    render() {
        var device;
        if (this.props.data.$device) {
            device=<span className="MessageItemDevice">{this.props.data.$device}</span>;
        } else {
            device = null;
        }
        return <div className="MessageItem">
            <span className="MessageItemDate">{timestampToDate(this.props.data.$timestamp).toLocaleTimeString()}</span>
            {device}
            <span className="MessageItemMessage">{this.props.data.$message}</span>
        </div>;
    }

    static mapStateToProps(store, ownProps) {
        return {
            data: store.backend.indiManager.messages.byUid[ownProps.uid]
        };
    }
}
Item = connect(Item.mapStateToProps)(Item);


class MessageList extends PureComponent {
    constructor(props) {
        super(props);
        this.state = {};
    }

    render() {
        var messagesUids = Object.keys(this.props.messages).sort().reverse();
        var content = messagesUids.map((uid)=><Item key={uid} uid={uid} id={uid}/>);
        return <div>{content}</div>;
    }

    static mapStateToProps(store, ownProps) {
        return {
            messages: store.backend.indiManager.messages.byUid
        };
    }
}
MessageList = connect(MessageList.mapStateToProps)(MessageList);

class MessageView extends PureComponent {

    constructor(props) {
        super(props);
        this.state = {};
    }

    render() {
        //var self = this;
        return(<React.Fragment>
            <div className="MessageView">
                <MessageList/>
            </div>
            <div style={{textAlign: 'right'}}>
                <i>MOBINDI</i> <a href='about.html' target='_new'>about</a>
            </div>
        </React.Fragment>);
    }
}


export default MessageView;