import React from 'react';
import CancellationToken from 'cancellationtoken';
import '../../AstrometryView.css';
import * as BackendRequest from "../../BackendRequest";
import * as Store from "../../Store";
import * as Utils from "../../Utils";
import Panel from "../../Panel";
import Int from '../../primitives/Int';

import DeviceConnectBton from '../../DeviceConnectBton';
import CameraSelector from "../../CameraSelector";
import CameraSettingsView from '../../CameraSettingsView';
import IndiSelectorEditor from '@src/IndiSelectorEditor';
import AstrometryBackendAccessor from "../../AstrometryBackendAccessor";
import * as BackendAccessor from "../../utils/BackendAccessor";
import { PolarAlignSettings } from '@bo/BackOfficeStatus';

type InputProps = {};
type MappedProps = {
    currentScope: string;
}
type Props = InputProps & MappedProps;

class InitialConfirm extends React.PureComponent<Props> {
    accessor: BackendAccessor.BackendAccessor<PolarAlignSettings>;
    
    constructor(props:Props) {
        super(props);
        this.accessor = new AstrometryBackendAccessor("$.astrometry.settings").child("polarAlign");
    }

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

    setSlewRate = async (s:string)=> {
        this.accessor.child("slewRate").send(s);
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

            <Panel guid="astrom:polaralign:movements">
                <span>Scope moves</span>
                <div>
                    Travel Angle (max 90°):
                    <Int accessor={this.accessor.child('angle')}/>
                </div>
                <div>
                    Number of samples:
                    <Int accessor={this.accessor.child('sampleCount')}/>
                </div>
                <div>
                    Slew rate:
                    <IndiSelectorEditor
                        device={this.props.currentScope}
                        valuePath="$.backend.astrometry.settings.polarAlign.slewRate"
                        setValue={this.setSlewRate}
                        vecName="TELESCOPE_SLEW_RATE"
                        />
                </div>
            </Panel>
        </>
    }

    static mapStateToProps(store: Store.Content, props: InputProps):MappedProps {
        return {
            currentScope: Utils.noErr(()=>store.backend.astrometry!.selectedScope, "") || ""
        }
    }
}

export default Store.Connect(InitialConfirm);