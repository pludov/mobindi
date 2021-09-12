import * as React from 'react';

import * as BackOfficeAPI from '@bo/BackOfficeAPI';
import CancellationToken from 'cancellationtoken';
import Log from './shared/Log';
import * as FocuserStore from "./FocuserStore";
import * as BackendRequest from "./BackendRequest";
import * as Store from "./Store";
import DeviceConnectBton from './DeviceConnectBton';
import DeviceSettingsBton from './DeviceSettingsBton';
import IndiPropertyView from "./indiview/IndiPropertyView";

import './CameraView.css'
import * as ImagingSetupStore from './ImagingSetupStore';
import CameraViewDevicePanel from './CameraViewDevicePanel';
import FilterSelector from './FilterSelector';

const logger = Log.logger(__filename);

type InputProps = {
    imagingSetup: string | null;
}

type MappedProps = {
    device: string | null;
    busy: boolean;
}

type Props = InputProps & MappedProps;

class FocuserSettingsPanel extends React.PureComponent<Props> {

    constructor(props: Props) {
        super(props);
    }

    private changeCallback = async(id:string, immediate:boolean, value:string)=>{
        if (this.props.device === null) {
            throw new Error("No device");
        }
        // Direct push of the value
        const request:BackOfficeAPI.UpdateIndiVectorRequest = {
            dev: this.props.device,
            vec: "ABS_FOCUS_POSITION",
            children: [
                {name: id, value: value}
            ]
        };
        await BackendRequest.RootInvoker("indi")("updateVector")(
            CancellationToken.CONTINUE,
            request
        );
    }


    render() {
        return (this.props.device !== null ?
                    <CameraViewDevicePanel title="Foc" deviceId={this.props.device}>
                        <IndiPropertyView dev={this.props.device}
                                        vec="ABS_FOCUS_POSITION"
                                        prop="FOCUS_ABSOLUTE_POSITION"
                                        showVecLabel={false} compact={true} forcedValue={undefined}
                                        busy={this.props.busy}
                                        onChange={this.changeCallback}/>
                        <DeviceConnectBton deviceId={this.props.device}/>
                        <DeviceSettingsBton deviceId={this.props.device}/>
                    </CameraViewDevicePanel>
                    :
                    null
                );
    }

    static mapStateToProps(store:Store.Content, ownProps: InputProps):MappedProps {
        const imagingSetup = ImagingSetupStore.getImagingSetup(store, ownProps.imagingSetup);

        const device = imagingSetup !== null ? imagingSetup.focuserDevice : null;

        return {
            device,
            busy: device !== null ? FocuserStore.isFocuserBusy(store, device): false
        }
    }
}

export default Store.Connect(FocuserSettingsPanel);
