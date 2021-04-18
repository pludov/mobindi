import * as React from 'react';
import { createSelector, defaultMemoize } from 'reselect'

import Log from './shared/Log';
import * as BackendRequest from "./BackendRequest";
import * as Store from "./Store";
import CameraSettingsView from './CameraSettingsView';
import DeviceConnectBton from './DeviceConnectBton';
import CancellationToken from 'cancellationtoken';
import DeviceSettingsBton from './DeviceSettingsBton';

import './CameraView.css'
import ImagingSetupSelector from './ImagingSetupSelector';
import CameraViewDevicePanel from './CameraViewDevicePanel';
import CameraDeviceSettingsBackendAccessor from './CameraDeviceSettingBackendAccessor';

const logger = Log.logger(__filename);

type InputProps = {
    imagingSetup: string | null;
}

type MappedProps = {
    device: string | null;
}

type Props = InputProps & MappedProps;

class CameraSettingsPanel extends React.PureComponent<Props> {

    constructor(props: Props) {
        super(props);
    }

    cameraSettingsAccessor = defaultMemoize((uid:string|null)=>new CameraDeviceSettingsBackendAccessor(uid));


    render() {
        return (this.props.device !== null ?
            <CameraViewDevicePanel title="Cam" deviceId={this.props.device}>
                <CameraSettingsView
                    imagingSetup={this.props.imagingSetup}
                    backendAccessor={this.cameraSettingsAccessor(this.props.imagingSetup)}
                />

                <DeviceConnectBton deviceId={this.props.device}/>
                <DeviceSettingsBton deviceId={this.props.device}/>
            </CameraViewDevicePanel>
            :null);
    }

    static mapStateToProps(store:Store.Content, ownProps: InputProps):MappedProps {
        const imagingSetup = ImagingSetupSelector.getImagingSetup(store, ownProps.imagingSetup);

        const device = imagingSetup !== null ? imagingSetup.cameraDevice : null;

        return {device}
    }
}

export default Store.Connect(CameraSettingsPanel);
