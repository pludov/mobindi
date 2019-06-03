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

type InputProps = {
}

type MappedProps = {
    url: string;
}

type Props = InputProps & MappedProps;

class CameraView extends React.PureComponent<Props> {

    constructor(props: Props) {
        super(props);
    }

    startAstrometry = async () => {
        console.log('Start astrometry ?' + this.props.url);
        await BackendRequest.RootInvoker("astrometry")("compute")(
            CancellationToken.CONTINUE,
            {
                image: this.props.url,
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
            <FitsViewerWithAstrometry
                contextKey="default"
                src={this.props.url}/>
            <ShootButton
                    activePath="$.backend.camera.selectedDevice"
                    onSuccess={this.setPhoto}
                    />
        </div>);
    }

    setPhoto = (rslt:ShootResult)=>{
    }

    static mapStateToProps(store:Store.Content, ownProps: InputProps) {
        try {
            const camera = noErr(()=>store.backend.camera!.selectedDevice, undefined);
            if (!camera) {
                return {
                    url: null,
                };
            }
            if (Object.prototype.hasOwnProperty.call(store.backend.camera!.lastByDevices, camera)) {
                return {url: store.backend.camera!.lastByDevices[camera]};
            } else {
                return {url: null};
            }
        } catch(e) {
            console.log('Ignored camera pb', e);
            return {url: null}
        }
    }
}

export default Store.Connect(CameraView);
