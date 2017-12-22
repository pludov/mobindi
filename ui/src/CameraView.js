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
        this.abort = this.abort.bind(this);
    }

    render() {
        var progress = 60;
        progress = this.props.running ? 100.0 * this.props.elapsed / this.props.exposure : 0;
        var title = !this.props.running ? '' :this.props.exposure + "s";

        return <div className={'ShootBar' + (this.props.running ? ' ActiveShootBar' : ' InactiveShootBar')}>
            <input disabled={(!this.props.available) || this.props.running} type="button" onClick={this.shoot} className="ShootBton" value="Shoot"/>
            <div className='ShootProgress' style={{position: 'relative'}}>
                <div style={{position: 'absolute', left: '0px', top: '0px', bottom:'0px', width: progress + '%'}}
                    className='ShootProgressAdvance'>
                </div>

                <div style={{position: 'absolute', left: '0px', right: '0px', top: '0px', bottom:'0px', top:'0px'}} className='ShootProgressTitle'>
                    {title}
                </div>
            </div>
            <input disabled={(!this.props.available) || !this.props.running} type="button" onClick={this.abort} className="ShootAbortBton" value="Abort"/>
        </div>;
    }

    shoot() {
        // FIXME: the button should be disabled until ack from server
        // ack from server should arrive only when state has been updated, ...
        // This looks like a progress channel is required
        var self = this;
        this.props.app.serverRequest({
            method: 'shoot'
        }).then((rslt)=>
        {
            console.log('got rslt:' + JSON.stringify(rslt));
            self.props.onSuccess(rslt);
        }).start();
    }

    abort() {
        this.props.app.serverRequest({
            method: 'abort'
        }).then((rslt)=>
        {
            console.log('got rslt:' + JSON.stringify(rslt));
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

        var currentShoot = atPath(store, '$.backend.camera.currentShoots[' + JSON.stringify(active) + "]");

        
        result.running = (currentShoot != undefined);
        if (result.running) {
            if ('expLeft' in currentShoot) {
                result.elapsed = currentShoot.exposure - currentShoot.expLeft;
            } else {
                result.elapsed = 0;
            }
            result.exposure = currentShoot.exposure;
        }

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
            <ShootBton
                    activePath="$.backend.camera.selectedDevice"
                    onSuccess={this.setPhoto} value="Shoot"
                    app={this.props.app}/>
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