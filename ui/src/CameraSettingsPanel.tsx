import * as React from 'react';
import { defaultMemoize } from 'reselect'

import Log from './shared/Log';
import * as Store from "./Store";
import * as CameraStore from "./CameraStore";
import CameraSettingsView from './CameraSettingsView';
import DeviceConnectBton from './DeviceConnectBton';
import DeviceSettingsBton from './DeviceSettingsBton';

import './CameraView.css'
import ImagingSetupSelector from './ImagingSetupSelector';
import CameraViewDevicePanel from './CameraViewDevicePanel';

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

    private readonly cameraSettingsAccessor = defaultMemoize(CameraStore.cameraDeviceSettingsAccessor);

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
