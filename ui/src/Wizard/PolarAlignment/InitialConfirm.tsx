import React from 'react';
import CancellationToken from 'cancellationtoken';
import '../../AstrometryView.css';
import * as BackendRequest from "../../BackendRequest";
import Panel from "../../Panel";

import DeviceConnectBton from '../../DeviceConnectBton';
import CameraSelector from "../../CameraSelector";
import CameraSettingsView from '../../CameraSettingsView';

type Props = {};

export default class InitialConfirm extends React.PureComponent<Props> {
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
        return <>
            Point the scope to the place of the sky where you’ll take image.<br/>
            Then click next to proceed.<br/>
            <br/>

            <Panel guid="astrom:polaralign:camera">
                <span>Camera settings</span>


                <div>
                    <CameraSelector setValue={this.setCamera}/>
                    <DeviceConnectBton
                            activePath="$.backend.camera.selectedDevice"/>
                </div>
                <CameraSettingsView
                    settingsPath="$.backend.camera.currentSettings"
                    activePath="$.backend.camera.selectedDevice"
                    setValue={this.settingSetter}
                    />
            </Panel>
        </>
    }
}

