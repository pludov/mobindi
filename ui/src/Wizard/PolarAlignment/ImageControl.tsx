import React from 'react';
import '../../AstrometryView.css';
import * as Store from "../../Store";
import * as CameraStore from "../../CameraStore";
import Panel from "../../Panel";
import * as FilterWheelStore from "../../FilterWheelStore";
import DeviceConnectBton from '../../DeviceConnectBton';
import CameraSettingsView from '../../CameraSettingsView';
import EditableImagingSetupSelector from '../../EditableImagingSetupSelector';
import * as ImagingSetupStore from '../../ImagingSetupStore';
import CameraViewDevicePanel from '../../CameraViewDevicePanel';
import DeviceSettingsBton from '../../DeviceSettingsBton';
import FilterSelector from '../../FilterSelector';
import { defaultMemoize } from 'reselect';

type InputProps = {
    imagingSetupIdAccessor: Store.Accessor<string|null>;
};
type MappedProps = {
    imagingSetup: string|null;
    cameraDevice: string|null;
    filterWheelDevice: string|null;
}

type Props = InputProps & MappedProps;

class ImageControl extends React.PureComponent<Props> {
    private readonly cameraSettingsAccessor = defaultMemoize(CameraStore.cameraDeviceSettingsAccessor);

    render() {
        return (<Panel guid="astrom:polaralign:camera">
            <span>Imaging settings</span>


            <div>
                <EditableImagingSetupSelector accessor={this.props.imagingSetupIdAccessor}/>

            </div>
            {this.props.cameraDevice !== null ?
                <CameraViewDevicePanel title="Cam" deviceId={this.props.cameraDevice}>
                    <CameraSettingsView
                        imagingSetup={this.props.imagingSetup}
                        backendAccessor={this.cameraSettingsAccessor(this.props.imagingSetup)}
                    />

                    <DeviceConnectBton deviceId={this.props.cameraDevice}/>
                    <DeviceSettingsBton deviceId={this.props.cameraDevice}/>
                </CameraViewDevicePanel>
                :
                null
            }
            {this.props.filterWheelDevice !== null ?
                <CameraViewDevicePanel title="F.W" deviceId={this.props.filterWheelDevice}>
                    <FilterSelector
                            isBusy={FilterWheelStore.isFilterWheelBusy}
                            getFilter={FilterWheelStore.currentTargetFilterId}
                            setFilter={FilterWheelStore.changeFilter}
                            filterWheelDevice={this.props.filterWheelDevice}/>

                    <DeviceConnectBton deviceId={this.props.filterWheelDevice}/>
                    <DeviceSettingsBton deviceId={this.props.filterWheelDevice}/>
                </CameraViewDevicePanel>
                :
                null
            }

        </Panel>)

    }

    static mapStateToProps(store: Store.Content, props: InputProps):MappedProps {
        const imagingSetup = props.imagingSetupIdAccessor.fromStore(store);
        const imagingSetupInstance = ImagingSetupStore.getImagingSetup(store, imagingSetup);
        const cameraDevice = imagingSetupInstance !== null ? imagingSetupInstance.cameraDevice : null;
        const filterWheelDevice = imagingSetupInstance !== null ? imagingSetupInstance.filterWheelDevice : null;

        return {
            imagingSetup,
            cameraDevice,
            filterWheelDevice,
        }
    }

}

export default Store.Connect(ImageControl);