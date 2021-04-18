import * as React from 'react';

import Log from './shared/Log';
import * as BackendRequest from "./BackendRequest";
import * as FilterWheelStore from "./FilterWheelStore";
import * as Store from "./Store";
import DeviceConnectBton from './DeviceConnectBton';
import DeviceSettingsBton from './DeviceSettingsBton';

import './CameraView.css'
import ImagingSetupSelector from './ImagingSetupSelector';
import CameraViewDevicePanel from './CameraViewDevicePanel';
import FilterSelector from './FilterSelector';

const logger = Log.logger(__filename);

type InputProps = {
    imagingSetup: string | null;
}

type MappedProps = {
    device: string | null;
}

type Props = InputProps & MappedProps;

class FilterWheelSettingsPanel extends React.PureComponent<Props> {

    constructor(props: Props) {
        super(props);
    }

    render() {
        return (this.props.device !== null ?
                    <CameraViewDevicePanel title="F.W" deviceId={this.props.device}>
                        <FilterSelector
                                isBusy={FilterWheelStore.isFilterWheelBusy}
                                getFilter={FilterWheelStore.currentTargetFilterId}
                                setFilter={FilterWheelStore.changeFilter}
                                filterWheelDevice={this.props.device}/>

                        <DeviceConnectBton deviceId={this.props.device}/>
                        <DeviceSettingsBton deviceId={this.props.device}/>
                    </CameraViewDevicePanel>
                    :
                    null
                );
    }

    static mapStateToProps(store:Store.Content, ownProps: InputProps):MappedProps {
        const imagingSetup = ImagingSetupSelector.getImagingSetup(store, ownProps.imagingSetup);

        const device = imagingSetup !== null ? imagingSetup.filterWheelDevice : null;

        return {device}
    }
}




export default Store.Connect(FilterWheelSettingsPanel);
