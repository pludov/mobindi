/**
 * Created by ludovic on 21/07/17.
 */
import React, { Component } from 'react';
import { connect } from 'react-redux';
import './AppIcon.css';

class AppIcon extends Component {
    constructor(props)
    {
        super(props);
        this.activate = this.activate.bind(this);
    }

    render() {
        var appId = this.props.appid;
        if (!(appId in this.props.apps)) return null;
        if (!this.props.apps[appId].enabled) return null;

        return (
            <div id={"AppIcon_" + appId} className={'Application' + (this.props.currentApp == appId ? ' Active' : '')} onClick={this.activate}>
                <img  src={appId + ".png"}></img>
            </div>);
    }

    activate() {
        console.log('Applicating');
        this.props.dispatch({type: 'SwitchToApp', value: this.props.appid});
    }
}

const mapStateToProps = function(store) {
    var result = {
        apps: store.backend.apps,
        currentApp: store.currentApp
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
