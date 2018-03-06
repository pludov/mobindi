/**
 * Created by ludovic on 21/07/17.
 */
import React, { Component } from 'react';
import { connect } from 'react-redux';
import * as Utils from './Utils';
import './AppIcon.css';

class AppIcon extends Component {
    constructor(props)
    {
        super(props);
        this.activate = this.activate.bind(this);
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

    activate() {
        console.log('Applicating');
        this.props.dispatch({type: 'SwitchToApp', value: this.props.appid});
    }
}

const mapStateToProps = function(store, ownProps) {
    var result = {
        apps: store.backend.apps,
        currentApp: store.currentApp,
        notification: Utils.noErr(()=>(store.appNotifications[ownProps.appid]), {error:true})
    };
    return result;
}

/*// FIXME: ça sert à quoi ?
const mapDispatchToProps = (dispatch) => {
    return {
        Activate: (value) => {
            dispatch({type: 'SwitchApplication', value: value});
        }
    };
}*/


export default connect(mapStateToProps)(AppIcon);
