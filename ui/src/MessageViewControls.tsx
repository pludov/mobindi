import * as React from 'react';

import * as Store from "./Store";
import Modal from './Modal';
import * as MessageStore from "./MessageStore";
import * as NotificationStore from "./NotificationStore";
import WatchSettingsView from './WatchSettingsView';
import "./MessageViewControls.css"

type MessageViewControlsInputProps = {
}

type MessageViewControlsMappedProps = {
    notificationAuth: boolean|undefined;
    watchActive: boolean;
}

type MessageViewControlsProps = MessageViewControlsInputProps & MessageViewControlsMappedProps;


class UnmappedMessageViewControls extends React.PureComponent<MessageViewControlsProps> {
    private modal = React.createRef<Modal>();

    constructor(props:MessageViewControlsProps) {
        super(props);
    }

    render() {
        console.log('render with ', this.props);
        const speaker = this.props.watchActive ? '🔊' : '🔇';

        return <div>
            <Modal ref={this.modal}>
                <WatchSettingsView/>
            </Modal>
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
                <input type="button"
                    className={"MessageViewControlBton"}
                    value="..."
                    onClick={this.configWatch}/>
            </div>
        </div>
    }

    readonly askAuth=()=> {
        MessageStore.performMessageAuth();
    }

    readonly switchWatch=() => {
        NotificationStore.switchWatchActive();
    }

    readonly configWatch=() => {
        this.modal.current?.open();
    }

    static mapStateToProps(store:Store.Content, ownProps:MessageViewControlsInputProps):MessageViewControlsMappedProps {
        return {
            notificationAuth: store.messages.notificationAuth,
            watchActive: !!store.watch?.active,
        };
    }
}

export default Store.Connect(UnmappedMessageViewControls);
