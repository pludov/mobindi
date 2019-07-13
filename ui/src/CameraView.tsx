import * as React from 'react';
import { connect } from 'react-redux';

import * as BackendRequest from "./BackendRequest";
import * as Store from "./Store";
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
import LiveFilterSelector from './LiveFilterSelector';
import { StreamSize } from '@bo/BackOfficeStatus';

type InputProps = {
}

type MappedProps = {
    path: string|null;
    streamId: string|null;
    streamSerial: string|null;
    streamSize: StreamSize|null;
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
        console.log('Start astrometry ?' + this.props.path);
        await BackendRequest.RootInvoker("astrometry")("compute")(
            CancellationToken.CONTINUE,
            {
                image: this.props.path,
            }
        );
        console.log('done astrometry ?');
    };

    setCamera = async(id: string)=>{
        await BackendRequest.RootInvoker("camera")("setCamera")(CancellationToken.CONTINUE, {device: id});
    }

    settingSetter = (propName:string):((v:any)=>Promise<void>)=>{
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
        return(<div className="CameraView">
            <div className="CameraViewSettings">
                <div>
                    <CameraSelector setValue={this.setCamera}/>
                    <DeviceConnectBton.forActivePath
                            activePath="$.backend.camera.selectedDevice"/>
                    <DeviceSettingsBton.forActivePath
                            activePath="$.backend.camera.selectedDevice"/>
                </div>
                <CameraSettingsView
                    settingsPath={"$.backend.camera.configuration.deviceSettings"}
                    activePath="$.backend.camera.selectedDevice"
                    setValue={this.settingSetter}
                />
                <LiveFilterSelector.forActivePath activePath="$.backend.camera.selectedDevice"/>
            </div>
            <div className="CameraViewDisplay">
                <FitsViewerWithAstrometry
                    contextKey="default"
                    path={this.props.path}
                    streamId={this.props.streamId}
                    streamSerial={this.props.streamSerial}
                    streamSize={this.props.streamSize}/>
            </div>
            <ShootButton
                    activePath="$.backend.camera.selectedDevice"
                    onSuccess={this.setPhoto}
                    />
        </div>);
    }

    setPhoto = (rslt:ShootResult)=>{
    }

    static mapStateToProps(store:Store.Content, ownProps: InputProps):MappedProps {
        try {
            const camera = noErr(()=>store.backend.camera!.selectedDevice, undefined);
            if (!camera) {
                return {
                    path: null,
                    streamId: null,
                    streamSerial: null,
                    streamSize: null,
                };
            }
            if (Object.prototype.hasOwnProperty.call(store.backend.camera!.currentStreams, camera)) {
                const stream= store.backend.camera!.currentStreams[camera];
                if (stream.streamId) {
                    return {
                        path: null,
                        streamId: stream.streamId,
                        streamSerial: stream.serial === null ? null : "" + stream.serial,
                        streamSize: stream.streamSize,
                    };
                }
            }
            if (Object.prototype.hasOwnProperty.call(store.backend.camera!.lastByDevices, camera)) {
                return {
                    path: store.backend.camera!.lastByDevices[camera],
                    streamId: null,
                    streamSerial: null,
                    streamSize: null,
                };
            } else {
                return {
                    path: null,
                    streamId: null,
                    streamSerial: null,
                    streamSize: null,
                };
            }
        } catch(e) {
            console.log('Ignored camera pb', e);
            return {
                path: null,
                streamId: null,
                streamSerial: null,
                streamSize: null,
            }
        }
    }
}

export default Store.Connect(CameraView);
