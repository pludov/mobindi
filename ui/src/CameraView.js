import React, { Component, PureComponent} from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';

import * as BackendRequest from "./BackendRequest";
import { atPath } from './shared/JsonPath';
import FitsViewerInContext from './FitsViewerInContext';
import PromiseSelector from './PromiseSelector';
import CameraSettingsView from './CameraSettingsView';
import DeviceConnectBton from './DeviceConnectBton';
import FitsViewerWithAstrometry from './FitsViewerWithAstrometry';

import './CameraView.css'

const CameraSelector = connect((store)=> ({
            active: store.backend && store.backend.camera ? store.backend.camera.selectedDevice : undefined,
            availables: store.backend && store.backend.camera ? store.backend.camera.availableDevices : []
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

    async shoot() {
        // FIXME: the button should be disabled until ack from server
        // ack from server should arrive only when state has been updated, ...
        // This looks like a progress channel is required
        const rslt = await this.props.app.serverRequest({
            method: 'shoot'
        })

        console.log('got rslt:' + JSON.stringify(rslt));
        this.props.onSuccess(rslt);
    }

    async abort() {
        await this.props.app.serverRequest({
            method: 'abort'
        })

        console.log('got rslt:' + JSON.stringify(rslt));
    }

    static mapStateToProps(store, ownProps) {
        var result = {
            available: false
        }
        var active = atPath(store, ownProps.activePath);
        if (active === undefined || active === null) return result;

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
        this.setPhoto = this.setPhoto.bind(this);
        this.connect = this.connect.bind(this);
        this.astrometryMenu = [
            {
                title: 'Astrometry',
                key: 'astrometry',
                cb: this.startAstrometry
            }
        ];
    }

    startAstrometry = async () => {
        console.log('Start astrometry ?' + this.props.url);
        await BackendRequest.RootInvoker("astrometry")("compute")(
            CancellationToken.CONTINUE,
            {
                image: this.props.url
            }
        );
        console.log('done astrometry ?');
    };

    render() {
        //var self = this;
        const contextMenu = this.props.url === '' ? null : this.astrometryMenu;

        return(<div className="CameraView">
            <div>
                <CameraSelector setValue={async (e)=>await this.props.app.serverRequest({method: 'setCamera', data: {device: e}})}/>
                <DeviceConnectBton
                        activePath="$.backend.camera.selectedDevice"
                        app={this.props.app}/>
            </div>
            <CameraSettingsView
                settingsPath="$.backend.camera.currentSettings"
                activePath="$.backend.camera.selectedDevice"
                setValue={(propName)=>(async (v)=>await this.props.app.serverRequest({method: 'setShootParam', data: {key: propName, value: v}}))}
                />
            <FitsViewerWithAstrometry 
                contextKey="default"
                src={this.props.url}
                app={this.props.app}/>
            <ShootBton
                    activePath="$.backend.camera.selectedDevice"
                    onSuccess={this.setPhoto} value="Shoot"
                    app={this.props.app}/>
        </div>);
    }

    setPhoto(rslt) {
    }

    async connect() {
        const rslt = await this.props.app.serverRequest({
            method: 'connect'
        })
        console.log('got rslt:' + JSON.stringify(rslt));
    }

    static mapStateToProps(store, ownProps) {
        try {
            const camera = store.backend.camera.selectedDevice;
            if (!camera) {
                return {url: null};
            }
            if (Object.prototype.hasOwnProperty.call(store.backend.camera.lastByDevices, camera)) {
                return {url: store.backend.camera.lastByDevices[camera]};
            } else {
                return {url: null};
            }
        } catch(e) {
            console.log('Ignored camera pb', e);
            return {url: null}
        }
    }
}

export default connect(CameraView.mapStateToProps)(CameraView);
