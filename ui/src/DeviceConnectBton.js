import React, { Component, PureComponent} from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';

import { atPath } from './shared/JsonPath';

// Display a connect/disconnect button for a device
class DeviceConnectBton extends PureComponent {
    constructor(props) {
        super(props);
        this.state = {running: false};
        this.switchConnection = this.switchConnection.bind(this);
    }

    render() {
        var title, enabled = false;

        switch(this.props.state) {
            case 'On':
                title='Disconnect';
                enabled = true;
                break;
            case 'Off':
                title='Connect';
                enabled = true;
                break;
            case 'Busy':
                title='Switching';
            default:
                title = 'Connect';
                enabled = false;
        }
        if (this.state.running) {
            title += "...";
            enabled = false;
        }

        return <input type="button" onClick={this.switchConnection} disabled={!enabled} value={title}/>
    }

    startPromise(t) {
        var self = this;
        if (this.state.runningPromise) {
            this.state.runningPromise.cancel();
        }

        function treatmentDone() {
            if (self.state.runningPromise != t) return;
            self.setState({runningPromise: undefined, running: false});
        }

        t.then(treatmentDone);
        t.onError(treatmentDone);
        t.onCancel(treatmentDone);

        this.setState({runningPromise : t, running: true});
        t.start();
    }

    switchConnection() {
        switch (this.props.state) {
            case 'On':
                this.props.app.appServerRequest('indiManager', {method: 'disconnectDevice', device: this.props.currentDevice}).start();
                break;
            case 'Off':
                this.props.app.appServerRequest('indiManager', {method: 'connectDevice', device: this.props.currentDevice}).start();
                break;
        }
    }


    static mapStateToProps(store, ownProps) {
        var result = {};
        var currentDevice = atPath(store, ownProps.activePath);
        result.currentDevice = currentDevice;
        if (currentDevice === null || currentDevice === undefined) {
            result.currentDevice = null;
            result.state = "NotFound";
            return result;
        }


        var vec, prop;
        try {
            vec = store.backend.indiManager.deviceTree[currentDevice].CONNECTION;

            if (vec.$state == "Busy") {
                result.state = "Busy";
                return result;
            }

            prop = vec.childs.CONNECT;
            result.state = prop.$_ == "On" ? "On" : "Off";

            return result;
        } catch(e) {
            result.state = "NotFound";
            return result;
        }
    }
}

DeviceConnectBton=connect(DeviceConnectBton.mapStateToProps)(DeviceConnectBton);


DeviceConnectBton.propTypes = {
    activePath: PropTypes.string.isRequired,
    app: PropTypes.any.isRequired
}

export default DeviceConnectBton;
