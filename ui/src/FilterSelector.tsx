import * as React from 'react';
import * as Help from './Help';
import * as Store from './Store';
import { noErr } from './Utils';
import * as BackendRequest from "./BackendRequest";
import * as DeviceIdMapper from './indiview/DeviceIdMapper';
import * as FilterWheelStore from "./FilterWheelStore";
import CancellationToken from 'cancellationtoken';

import './CameraView.css'
import DeviceConnectBton from './DeviceConnectBton';

type InputProps = {
    // cameraDeviceId
    deviceId: string;

    // Where to store the choosen filter
    getFilter(store: Store.Content, filterWheelDeviceId: string): string | null;
    isBusy?:(store:Store.Content, filterWheelDeviceId: string)=>boolean;
    setFilter: (filterWheelDeviceId: string|null, filterId: string|null) => Promise<void>;

    focusRef?: React.RefObject<HTMLSelectElement>
}

type MappedProps = {
    currentFilterWheel: string | null;
    availableFilterWheels: string[];
    preferedFilterWheel: string | null;

    currentFilter: string | null;
    availableFilters: string[];
    busy: boolean;
}

type Props = InputProps & MappedProps;


class UnmappedFilterSelector extends React.PureComponent<Props> {
    static filterSelectorHelp = Help.key("Filter selector", "Select filterwheel device and filter. Use options from the \"switch filterwheel\" section to change device");
    constructor(props: Props) {
        super(props);
    }

    forceOption(valid: string[], possiblyMissing: string | null) {
        let ret = valid.map(v => ({ title: v, value: v }));

        if (possiblyMissing !== null && valid.indexOf(possiblyMissing) === -1) {
            ret = [
                {
                    title: possiblyMissing + '-Missing',
                    value: possiblyMissing,
                },
                ...ret
            ];
        }
        return ret;
    }

    currentFilters() {
        const filters = this.forceOption(this.props.availableFilters, this.props.currentFilter);
        if (filters.length === 0) {
            return <option key={"nofilter"} value="nofilter" disabled>No filter found</option>;

        }
        return filters.map((filter) =>
            <option key={"filter:" + filter.value} value={"filter:" + filter.value}>{filter.title}</option>
        );
    }

    currentFilterWheels() {
        const ret = this.props.availableFilterWheels.map(
            fw =>
                fw !== this.props.currentFilterWheel
                    ? <option key={"dev:" + fw} value={"dev:" + fw}>{fw}</option>
                    : null
        )
        if (this.props.currentFilterWheel !== null) {
            ret.push(<option key="nodev" value="">No filterwheel</option>);
        }
        return ret;
    }

    update = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const targetValue = e.target.value;
        if (targetValue.startsWith("dev:") || targetValue === "") {
            const targetFw = targetValue === "" ? null : targetValue.substr(4);
            // FIXME: progress feedback
            BackendRequest.RootInvoker("filterWheel")("setFilterWheel")(CancellationToken.CONTINUE, {cameraDeviceId: this.props.deviceId, filterWheelDeviceId: targetFw});
            this.props.setFilter(targetFw, null);
        } else if (targetValue.startsWith("filter:")) {
            const targetFilter = targetValue.substr(7);
            // FIXME: progress feedback
            this.props.setFilter(this.props.currentFilterWheel!, targetFilter);
        } else {
            throw new Error("unsupported filterwheel value: " + targetValue);
        }
    }

    render() {
        const currentValue = this.props.currentFilterWheel === null || this.props.currentFilter === null
            ? ""
            : "filter:" + this.props.currentFilter;
        return <>
            <span>
                <select className={"FilterSelector" + (this.props.busy ? " BusyInfinite" : "")} onChange={this.update} value={currentValue} ref={this.props.focusRef} {...UnmappedFilterSelector.filterSelectorHelp.dom()}>
                    {this.props.currentFilterWheel === null
                        ? this.props.availableFilterWheels.length !== 0
                            ? <option value="" disabled hidden>Filterwheel...</option>
                            : <option value="" disabled hidden>No filterwheel</option>
                        : this.props.currentFilter === null
                            ? <option value="" disabled hidden>Filter...</option>
                            : null
                    }
                    {this.props.currentFilterWheel !== null
                        ? true || (this.props.availableFilterWheels.length === 0
                            || this.forceOption(this.props.availableFilterWheels, this.props.currentFilterWheel).length > 1)
                            ?
                                <>
                                    <optgroup key={"dev:" + this.props.currentFilterWheel} label={this.props.currentFilterWheel}>{this.currentFilters()}</optgroup>
                                    <optgroup key={"otherdevices"} label="Switch filterwheel">{this.currentFilterWheels()}</optgroup> 
                                </>
                            :
                                <>
                                    this.currentFilters()
                                </>
                        : this.currentFilterWheels()
                    }
                </select>
                {this.props.currentFilterWheel !== null
                    ? <DeviceConnectBton deviceId={this.props.currentFilterWheel}/>
                    : null
                }
            </span>
            </>
    }

    static mapStateToProps = function (store: Store.Content, ownProps: InputProps) {
        const currentFilterWheel = noErr(() => store.backend.camera!.dynStateByDevices[ownProps.deviceId].filterWheelDevice, null) || null;

        return ({
            currentFilterWheel,
            availableFilterWheels: noErr(() => store.backend.filterWheel!.availableDevices, null) || [],
            preferedFilterWheel: noErr(() => store.backend.camera!.configuration.deviceSettings[ownProps.deviceId].preferedFilterWheelDevice, null) || null,

            busy:
                currentFilterWheel === null || !ownProps.isBusy
                    ? false
                    : ownProps.isBusy(store, currentFilterWheel),
            currentFilter:
                currentFilterWheel === null
                    ? null
                    : ownProps.getFilter(store, currentFilterWheel),
            availableFilters:
                currentFilterWheel === null
                    ? null
                    : FilterWheelStore.availableFilterIds(store, currentFilterWheel),
        });
    }
}

const ctor = Store.Connect(UnmappedFilterSelector);
const forActivePath = DeviceIdMapper.forActivePath(ctor);

(ctor as any).forActivePath = forActivePath;

export default ctor as (typeof ctor & {forActivePath : typeof forActivePath});




