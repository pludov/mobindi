import React, { Component } from 'react';
import { connect } from 'react-redux';
import * as Utils from './Utils';
import './AppIcon.css';
import * as Store from './Store';
import * as Actions from './Actions';
import * as BackendStore from './BackendStore';
import { BackofficeStatus } from '@bo/BackOfficeStatus';

export type InputProps = {
    appid: string;
};

export type MappedProps = {
    apps: BackofficeStatus["apps"];
    currentApp: Store.Content["currentApp"];
    notification: any;
}

export type Props = InputProps & MappedProps;

class AppIcon extends React.PureComponent<Props> {
    constructor(props:Props)
    {
        super(props);
    }

    render() {
        var appId = this.props.appid;
        if (!this.props.apps) return null;
        if (!(appId in this.props.apps)) return null;
        if (!this.props.apps[appId].enabled) return null;
        var inner = null;
        if (this.props.notification !== undefined) {
            inner = <span className={"Notification" + (this.props.notification.className ? " Notification_" + this.props.notification.className:"")}>{this.props.notification.text}</span>
        }
        return (
            <div id={"AppIcon_" + appId} className={'Application' + (this.props.currentApp == appId ? ' Active' : '')} onClick={this.activate}>
                <img  src={appId + ".png"}></img>
                {inner}
            </div>);
    }

    private activate=()=>{
        Actions.dispatch<BackendStore.Actions>("SwitchToApp")({value: this.props.appid});
    }
}

const mapStateToProps = function(store:Store.Content, ownProps:InputProps) {
    var result = {
        apps: store.backend.apps,
        currentApp: store.currentApp,
        notification: Utils.noErr(()=>(store.appNotifications[ownProps.appid]), {error:true})
    };
    return result;
}

export default connect(mapStateToProps)(AppIcon);
