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
import ShootButton from "./ShootButton";
import './CameraView.css'

const CameraSelector = connect((store)=> ({
            active: store.backend && store.backend.camera ? store.backend.camera.selectedDevice : undefined,
            availables: store.backend && store.backend.camera ? store.backend.camera.availableDevices : []
}))(PromiseSelector);

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
                        activePath="$.backend.camera.selectedDevice"/>
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
            <ShootButton
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
