import * as React from 'react';

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

    private settingSetter = (propName:string):((v:any)=>Promise<void>)=>{
        return async (v:any)=> {
            await BackendRequest.RootInvoker("camera")("setShootParam")(
                CancellationToken.CONTINUE,
                {
                    key: propName as any,
                    value: v
                }
            );
        }
    }

    render() {
        return (this.props.device !== null ?
            <CameraViewDevicePanel title="Cam" deviceId={this.props.device}>
                <CameraSettingsView
                    current={this.props.device}
                    activePath={"unused - remove me"}
                    settingsPath={"$.backend.camera.configuration.deviceSettings"}
                    setValue={this.settingSetter}
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
