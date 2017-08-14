import React, { Component, PureComponent} from 'react';
import PropTypes from 'prop-types';
import { notifier, BackendStatus } from './Store';
import { connect } from 'react-redux';

import { atPath } from './shared/JsonPath';
import FitsViewer from './FitsViewer';
import PromiseSelector from './PromiseSelector';
import CameraSettingsView from './CameraSettingsView';
import DeviceConnectBton from './DeviceConnectBton';
import './CameraView.css'


const CameraSelector = connect((store)=> ({
            active: store.backend.camera.selectedDevice,
            availables: store.backend.camera.availableDevices
}))(PromiseSelector);

class ShootBton extends PureComponent {
    constructor(props) {
        super(props);
        this.shoot = this.shoot.bind(this);
    }

    render() {
        return <input disabled={(!this.props.available) || this.props.running} type="button" onClick={this.shoot} className="shootBton" value="Shoot"/>
    }

    shoot() {
        var self = this;
        this.props.app.serverRequest({
            method: 'shoot'
        }).then((rslt)=>
        {
            console.log('got rslt:' + JSON.stringify(rslt));
            self.props.onSuccess(rslt);
        }).start();
    }

    static mapStateToProps(store, ownProps) {
        var result = {
            available: false
        }
        var active = atPath(store, ownProps.activePath);
        if (active === null) return result;

        // Check if exposure is present
        var deviceNode = atPath(store, '$.backend.indiManager.deviceTree[' + JSON.stringify(active) + "].CCD_EXPOSURE");
        if (deviceNode === undefined) return result;
        
        result.available = true;

        result.running = (deviceNode.$state == 'Busy');

        return result;
    }
}

ShootBton = connect(ShootBton.mapStateToProps)(ShootBton);

ShootBton.propTypes = {
    onSuccess: PropTypes.func.isRequired,
    activePath: PropTypes.string.isRequired,
    app: PropTypes.any.isRequired
}

class CameraView extends PureComponent {

    constructor(props) {
        super(props);
        this.state = {url: 'test.jpg'};
        this.setPhoto = this.setPhoto.bind(this);
        this.connect = this.connect.bind(this);
    }

    render() {
        //var self = this;
        return(<div className="CameraView">
            <div>
                <CameraSelector setValue={(e)=>this.props.app.serverRequest({method: 'setCamera', data: {device: e}})}/>
                <DeviceConnectBton
                        activePath="$.backend.camera.selectedDevice"
                        app={this.props.app}/>
            </div>
            <CameraSettingsView
                settingsPath="$.backend.camera.currentSettings"
                activePath="$.backend.camera.selectedDevice"
                setValue={(propName)=>((v)=>this.props.app.serverRequest({method: 'setShootParam', data: {key: propName, value: v}}))}
                />
            <div className="FitsViewer FitsViewContainer">
                <FitsViewer src={this.state.url}/>
            </div>
            <div className="ButtonBar">
                <ShootBton
                        activePath="$.backend.camera.selectedDevice"
                        onSuccess={this.setPhoto} value="Shoot"
                        app={this.props.app}/>
            </div>
        </div>);
    }

    setPhoto(rslt) {
        this.setState({url : 'fitsviewer/fitsviewer.cgi?path=' + encodeURIComponent(rslt.path)});
    }

    connect() {
        var self = this;
        this.props.app.serverRequest({
            method: 'connect'
        }).then((rslt)=>
        {
            console.log('got rslt:' + JSON.stringify(rslt));
        }).start();
    }
}


export default CameraView;