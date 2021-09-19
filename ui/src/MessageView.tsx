import * as React from 'react';

import { IndiMessageWithUid } from '@bo/BackOfficeStatus';
import { timestampToDate } from './IndiUtils';
import * as Store from "./Store";
import * as MessageStore from "./MessageStore";
import MessageViewControls from "./MessageViewControls";
import './MessageView.css'

type ItemInputProps = {
    uid: string;
}

type ItemMappedProps = {
    data: IndiMessageWithUid;
};

type ItemProps = ItemInputProps & ItemMappedProps;

class UnmappedItem extends React.PureComponent<ItemProps> {
    constructor(props:ItemProps) {
        super(props);
    }

    render() {
        let device;
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

    static mapStateToProps(store:Store.Content, ownProps: ItemInputProps) {
        return {
            data: store.backend.indiManager!.messages.byUid[ownProps.uid]
        };
    }
}

const Item = Store.Connect<UnmappedItem, ItemInputProps, {}, ItemMappedProps>(UnmappedItem);

type MessageListInputProps = {
}

type MessageListMappedProps = {
    messages: {[uuid:string]:IndiMessageWithUid};
}

type MessageListProps = MessageListInputProps & MessageListMappedProps;

const emptyObject = {};

class UnmappedMessageList extends React.PureComponent<MessageListProps> {
    constructor(props:MessageListProps) {
        super(props);
    }

    render() {
        const messagesUids = Object.keys(this.props.messages).sort().reverse();
        const content = messagesUids.map((uid)=><Item key={uid} uid={uid}/>);
        return <div>{content}</div>;
    }

    static mapStateToProps(store:Store.Content, ownProps:MessageListInputProps) {
        return {
            messages: store.backend.indiManager?.messages.byUid || emptyObject
        };
    }
}

const MessageList = Store.Connect<UnmappedMessageList, MessageListInputProps, {}, MessageListMappedProps>(UnmappedMessageList);


type Props = {
};

export default class MessageView extends React.PureComponent<Props> {
    constructor(props:Props) {
        super(props);
    }

    render() {
        return(<React.Fragment>
            <MessageViewControls/>
            <div className="MessageView">
                <MessageList/>
            </div>
            <div style={{textAlign: 'right'}}>
                <i>MOBINDI</i> <a href='about.html' target='_new'>about</a>
            </div>
        </React.Fragment>);
    }
}
