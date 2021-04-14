import * as React from 'react';
import { connect } from 'react-redux';

import * as BackendRequest from "./BackendRequest";
import * as Store from "./Store";

import * as IndiUtils from './IndiUtils';
import CameraSettingsView from './CameraSettingsView';
import DeviceConnectBton from './DeviceConnectBton';
import FitsViewerWithAstrometry from './FitsViewerWithAstrometry';
import ShootButton from "./ShootButton";
import CancellationToken from 'cancellationtoken';
import { noErr } from './Utils';
import { ShootResult } from '@bo/BackOfficeAPI';
import CameraSelector from "./CameraSelector";
import DeviceSettingsBton from './DeviceSettingsBton';

import './CameraView.css'
import { StreamSize } from '@bo/BackOfficeStatus';
import EditableImagingSetupSelector from './EditableImagingSetupSelector';
import ImagingSetupSelector from './ImagingSetupSelector';

type InputProps = {
    title: string;
    deviceId: string|null;
    // TODO : add a device kind or a property path (like camera.availableDevices, ...)
}

type MappedProps = {
    valid: boolean;
}


type Props = InputProps & MappedProps;

class CameraViewDevicePanel extends React.PureComponent<Props> {
    constructor(props: Props) {
        super(props);
    }

    render() {
        let className, title;
        if (this.props.deviceId !== null) {
            className = this.props.valid ? "CameraViewValidDevice" : "CameraViewInvalidDevice";
            title = this.props.title;
        } else {
            className = "CameraViewUnsetDevice";
            title = "No " + this.props.title;
        }
        return <div>
            <span className={className}>{title}</span>
            {this.props.valid ? this.props.children : null}
        </div>
    }

    static mapStateToProps(store:Store.Content, ownProps: InputProps):MappedProps {
        return {
            valid: ownProps.deviceId !== null &&
                        IndiUtils.getDeviceDesc(store, ownProps.deviceId) !== null
        }
    }
}

export default Store.Connect(CameraViewDevicePanel);