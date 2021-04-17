import * as React from 'react';

import Log from './shared/Log';
import * as BackendRequest from "./BackendRequest";
import * as Store from "./Store";
import FitsViewerWithAstrometry from './FitsViewerWithAstrometry';
import ShootButton from "./ShootButton";
import CancellationToken from 'cancellationtoken';
import { ShootResult } from '@bo/BackOfficeAPI';

import './CameraView.css'
import { StreamSize } from '@bo/BackOfficeStatus';
import EditableImagingSetupSelector from './EditableImagingSetupSelector';
import ImagingSetupSelector from './ImagingSetupSelector';
import CameraSettingsPanel from './CameraSettingsPanel';
import FilterWheelSettingsPanel from './FilterWheelSettingsPanel';

const logger = Log.logger(__filename);

type InputProps = {
}

type MappedProps = {
    path: string|null;
    imagingSetup: string|null;
    streamId: string|null;
    streamSerial: string|null;
    streamSize: StreamSize|null;
    cameraDevice: string|null;
}

type Props = InputProps & MappedProps;

class CameraView extends React.PureComponent<Props> {

    constructor(props: Props) {
        super(props);
    }

    startAstrometry = async () => {
        if (this.props.path === null) {
            throw new Error("Astrometry require a fits file");
        }
        logger.debug('Start astrometry', {path: this.props.path});
        await BackendRequest.RootInvoker("astrometry")("compute")(
            CancellationToken.CONTINUE,
            {
                image: this.props.path,
            }
        );
        logger.debug('done astrometry ?');
    };

    setCamera = async(id: string)=>{
        await BackendRequest.RootInvoker("camera")("setCamera")(CancellationToken.CONTINUE, {device: id});
    }

    render() {
        return(<div className="CameraView">
            <div className="CameraViewSettings">
                <div>
                    <EditableImagingSetupSelector setValue={ImagingSetupSelector.setCurrentImagingSetup} getValue={ImagingSetupSelector.getCurrentImagingSetupUid}/>
                </div>
                <CameraSettingsPanel imagingSetup={this.props.imagingSetup}/>
                <FilterWheelSettingsPanel imagingSetup={this.props.imagingSetup}/>
            </div>
            <div className="CameraViewDisplay">
                <FitsViewerWithAstrometry
                    contextKey="default"
                    path={this.props.path}
                    streamId={this.props.streamId}
                    streamSerial={this.props.streamSerial}
                    streamSize={this.props.streamSize}
                    subframe={null}/>
            </div>
            <ShootButton
                    cameraDevice={this.props.cameraDevice}
                    onSuccess={this.setPhoto}
                    />
        </div>);
    }

    setPhoto = (rslt:ShootResult)=>{
    }

    static mapStateToProps(store:Store.Content, ownProps: InputProps):MappedProps {
        const imagingSetup = ImagingSetupSelector.getCurrentImagingSetupUid(store);
        const imagingSetupInstance = ImagingSetupSelector.getImagingSetup(store, imagingSetup);

        const cameraDevice = imagingSetupInstance !== null ? imagingSetupInstance.cameraDevice : null;

        if (cameraDevice !== null && Object.prototype.hasOwnProperty.call(store.backend.camera!.currentStreams, cameraDevice)) {
            const stream= store.backend.camera!.currentStreams[cameraDevice];
            if (stream.streamId) {
                return {
                    imagingSetup,
                    path: null,
                    streamId: stream.streamId,
                    streamSerial: stream.serial === null ? null : "" + stream.serial,
                    streamSize: stream.streamSize,
                    cameraDevice,
                };
            }
        }

        if (cameraDevice !== null && Object.prototype.hasOwnProperty.call(store.backend.camera!.lastByDevices, cameraDevice)) {
            return {
                imagingSetup,
                path: store.backend.camera!.lastByDevices[cameraDevice],
                streamId: null,
                streamSerial: null,
                streamSize: null,
                cameraDevice,
            };
        }
        return {
            imagingSetup,
            path: null,
            streamId: null,
            streamSerial: null,
            streamSize: null,
            cameraDevice,
        };
    }
}

export default Store.Connect(CameraView);
