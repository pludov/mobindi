import * as React from 'react';

import Log from './shared/Log';
import * as BackendRequest from "./BackendRequest";
import * as Store from "./Store";
import FitsViewerWithAstrometry from './FitsViewerWithAstrometry';
import ShootButton from "./ShootButton";
import CancellationToken from 'cancellationtoken';
import { ShootResult } from '@bo/BackOfficeAPI';

import './CameraView.css'
import { StreamDetails } from '@bo/BackOfficeStatus';
import EditableImagingSetupSelector from './EditableImagingSetupSelector';
import * as ImagingSetupStore from './ImagingSetupStore';
import * as CameraStore from './CameraStore';
import CameraSettingsPanel from './CameraSettingsPanel';
import FilterWheelSettingsPanel from './FilterWheelSettingsPanel';
import FocuserSettingsPanel from './FocuserSettingsPanel';
import ImageOrImagingSetupSelector from './ImageOrImagingSetupSelector';

const logger = Log.logger(__filename);

type InputProps = {
    imagingSetupIdAccessor: Store.Accessor<string|null>;
}

type MappedProps = {
    path: string|null;
    imagingSetup: string|null;
    streamId: string|null;
    streamSerial: string|null;
    streamDetails: StreamDetails|null;
    cameraDevice: string|null;
}

type Props = InputProps & MappedProps;

type State = {
    loadedImage: string|undefined;
};

class CameraView extends React.PureComponent<Props, State> {

    constructor(props: Props) {
        super(props);
        this.state = {
            loadedImage: undefined
        }
    }

    private readonly defaultImageLoadingPathAccessor = CameraStore.defaultImageLoadingPathAccessor();

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

    loadImage = (path: string)=>{
        this.setState({loadedImage: path});
    }

    render() {
        return(<div className="CameraView">
            <div className="CameraViewSettings">
                <div>
                    <ImageOrImagingSetupSelector
                        loadedPath={this.state.loadedImage}
                        onloadPath={this.loadImage}
                        accessor={this.props.imagingSetupIdAccessor}
                        defaultPathAccessor={this.defaultImageLoadingPathAccessor}/>
                </div>
                {this.state.loadedImage === undefined
                    ?
                        <>
                            <CameraSettingsPanel imagingSetup={this.props.imagingSetup}/>
                            <FilterWheelSettingsPanel imagingSetup={this.props.imagingSetup}/>
                            <FocuserSettingsPanel imagingSetup={this.props.imagingSetup}/>
                        </>
                    : null
                }
            </div>
            <div className="CameraViewDisplay">
                <FitsViewerWithAstrometry
                    contextKey="default"
                    path={this.state.loadedImage || this.props.path}
                    streamId={this.props.streamId}
                    streamSerial={this.props.streamSerial}
                    streamDetails={this.props.streamDetails}
                    subframe={null}/>
            </div>
            {this.state.loadedImage === undefined
                ?
                    <ShootButton
                            cameraDevice={this.props.cameraDevice}
                            onSuccess={this.setPhoto}
                            />
                : null
            }
        </div>);
    }

    setPhoto = (rslt:ShootResult)=>{
    }

    static mapStateToProps= ()=> {
        return (store:Store.Content, ownProps: InputProps):MappedProps=>{
            const imagingSetup = ownProps.imagingSetupIdAccessor.fromStore(store);
            const imagingSetupInstance = ImagingSetupStore.getImagingSetup(store, imagingSetup);

            const cameraDevice = imagingSetupInstance !== null ? imagingSetupInstance.cameraDevice : null;

            if (cameraDevice !== null && Object.prototype.hasOwnProperty.call(store.backend.camera!.currentStreams, cameraDevice)) {
                const stream= store.backend.camera!.currentStreams[cameraDevice];
                if (stream.streamId && stream.serial !== null) {
                    return {
                        imagingSetup,
                        path: null,
                        streamId: stream.streamId,
                        streamSerial: "" + stream.serial,
                        streamDetails: stream.streamDetails,
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
                    streamDetails: null,
                    cameraDevice,
                };
            }
            return {
                imagingSetup,
                path: null,
                streamId: null,
                streamSerial: null,
                streamDetails: null,
                cameraDevice,
            };
        }
    }
}

export default Store.Connect(CameraView);
