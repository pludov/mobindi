import * as React from 'react';

import { IndiMessageWithUid } from '@bo/BackOfficeStatus';
import { timestampToDate } from './IndiUtils';
import * as Store from "./Store";
import * as MessageStore from "./MessageStore";
import * as NotificationStore from "./NotificationStore";
import "./MessageViewControls.css"

type MessageViewControlsInputProps = {
}

type MessageViewControlsMappedProps = {
    notificationAuth: boolean|undefined;
    watchActive: boolean;
}

type MessageViewControlsProps = MessageViewControlsInputProps & MessageViewControlsMappedProps;


class UnmappedMessageViewControls extends React.PureComponent<MessageViewControlsProps> {
    constructor(props:MessageViewControlsProps) {
        super(props);
    }

    render() {
        console.log('render with ', this.props);
        const speaker = this.props.watchActive ? '🔊' : '🔇';

        return <div>
            {this.props.notificationAuth === true
                ? null
                : <input type="button" value="Allow system notifications" onClick={this.askAuth}/>
            }
            <div>
                Audio alerts:
                <input type="button"
                    className={"MessageViewControlBton "
                            + (this.props.watchActive ? "On" : "Off")}
                    value={speaker}
                    onClick={this.switchWatch}/>
            </div>
        </div>
    }

    readonly askAuth=()=> {
        MessageStore.performMessageAuth();
    }

    readonly switchWatch=() => {
        NotificationStore.switchWatchActive();
    }

    static mapStateToProps(store:Store.Content, ownProps:MessageViewControlsInputProps):MessageViewControlsMappedProps {
        return {
            notificationAuth: store.messages.notificationAuth,
            watchActive: !!store.watch?.active,
        };
    }
}

export default Store.Connect(UnmappedMessageViewControls);
