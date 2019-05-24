import * as React from 'react';
import * as DeviceIdMapper from './indiview/DeviceIdMapper';
import * as FilterWheelStore from "./FilterWheelStore";
import FilterSelector from './FilterSelector';

type Props = {
    // path to currentSettings
    deviceId: string;
}


export default class LiveFilterSelector extends React.PureComponent<Props> {
    constructor(props: Props) {
        super(props);
    }

    changeFilter = async (filterWheel:string, filterId: string|null)=> {
        if (filterId === null) {
            return;
        }
        await FilterWheelStore.changeFilter(filterWheel, filterId);
    }

    render() {
        return <FilterSelector
                    deviceId={this.props.deviceId}
                    isBusy={FilterWheelStore.isFilterWheelBusy}
                    getFilter={FilterWheelStore.currentTargetFilterId}
                    setFilter={this.changeFilter}
                    />
    }

    static forActivePath = DeviceIdMapper.forActivePath(LiveFilterSelector);
}







