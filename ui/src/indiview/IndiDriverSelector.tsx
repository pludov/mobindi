/**
 * Created by ludovic on 21/07/17.
 */
import React, { Component, PureComponent} from 'react';
import * as Help from "../Help";
import * as Store from "../Store";
import * as IndiStore from "../IndiStore";
import * as Actions from "../Actions";
import { getOwnProp, has, shallowEqual } from '../Utils';
import * as IndiManagerStore from "../IndiManagerStore";

import "./IndiManagerView.css";
import { defaultMemoize } from 'reselect';

type InputProps = {
}

type Option = {
    value: string;
    title: string;
}

type MappedProps = {
    current: string;
    options: Array<Option>;
}

type Props = InputProps & MappedProps;

class IndiDriverSelector extends React.Component<Props> {
    static help = Help.key("INDI driver selector", "Select which INDI device or driver to view details for.");

    constructor(props:Props) {
        super(props);
    }

    updateDriver = (e:React.ChangeEvent<HTMLSelectElement>)=> {
        const target = e.target.value;
        Actions.dispatch<IndiManagerStore.IndiManagerActions>()("switchToDevice", {dev: target});
    }

    render() {
        const deviceSelectorOptions = this.props.options.map((item) => <option key={item.value} value={item.value}>{item.title}</option>);
        return (<select value={this.props.current}
            onChange={this.updateDriver}
            {...IndiDriverSelector.help.dom()}
            placeholder="Select device...">
            {deviceSelectorOptions}
        </select>);
    }

    // Limit the refresh for the selector (would reset selection)
    shouldComponentUpdate(nextProps:Props) {
        if (this.props.current !== nextProps.current) {
            return true;
        }
        if (this.props.options.length !== nextProps.options.length) {
            return true;
        }
        for(let i = 0; i < this.props.options.length; ++i) {
            if (this.props.options[i] !== nextProps.options[i]) {
                return true;
            }
        }
        return false;
    }

    static renderProps(devices: Array<string>,
                        drivers: Array<string>,
                        titles: {[dev: string]: string},
                        selectedDevice: string|undefined): MappedProps
    {
        const deviceSelectorOptions:Option[] = [];

        console.log('Rendering driver selector with titles', titles);
        let currentDeviceFound= false;

        let currentDevice = selectedDevice;
        if (currentDevice == undefined) currentDevice = "";

        // Search for the devices
        const found = {};
        for(const o of devices) {
            if (o === currentDevice) currentDeviceFound = true;
            deviceSelectorOptions.push({
                value: o,
                title: getOwnProp(titles, o) || o,
            });
            found[o] = 1;
        }

        // Add the drivers
        for(const o of drivers)
        {
            if (Object.prototype.hasOwnProperty.call(found, o)) {
                continue;
            }
            if (o === currentDevice) currentDeviceFound = true;
            deviceSelectorOptions.push({
                value: o,
                title: getOwnProp(titles, o) || o
            });
        }

        // Make sure the current device is in the list
        if (!currentDeviceFound) {
            deviceSelectorOptions.splice(0,0, {
                value: currentDevice,
                title: currentDevice
            });
        }

        return {
            options: deviceSelectorOptions,
            current:currentDevice
        };
    }

    static computeTitles = (device: Array<string>,
                            drivers: Array<string>,
                            devicesWithProfile: {[dev: string]: boolean},
                            mismatchStats: {[dev: string]: number})=>
    {
        const ret = {};
        // This space will not disappear in the option rendering
        const selectorSpace = '  　';
        for(const dev of device) {
            let title = dev;

            const mismatch = getOwnProp(mismatchStats, dev) || 0;
            const profile = getOwnProp(devicesWithProfile, dev) || false;

            if (profile || mismatch >= 1) {
                title += selectorSpace;
            }

            if (mismatch > 1) {
                title += " " + mismatchStats[dev] + "⚠️";
            } else if (mismatch === 1) {
                title += " ⚠️";
            }

            if (profile) {
                title += " 🔒";
            }
            ret[dev] = title;
        }
        for(const driver of drivers) {
            if (has(ret, driver)) {
                continue;
            }
            // Show a disconnected sign
            ret[driver] = "🔌 "+driver;

        }
        return ret;
    };

    static mapStateToProps(){
        const getDevices = IndiStore.getDevices();
        const getDrivers = IndiStore.getDrivers();

        const getControledDevices = IndiStore.getDevicesWithActiveProfile();
        const getMismatchStats = IndiStore.getDevicesMismatchStats();

        const computeTitles = defaultMemoize(IndiDriverSelector.computeTitles, {
            resultEqualityCheck: shallowEqual
        });

        const memoized = defaultMemoize(IndiDriverSelector.renderProps);
        return (store: Store.Content, ownProps: InputProps):MappedProps => {
            const devices = getDevices(store);
            const drivers = getDrivers(store);
            return memoized(devices,
                            drivers,
                            computeTitles(
                                devices,
                                drivers,
                                getControledDevices(store),
                                getMismatchStats(store)),
                            store.indiManager?.selectedDevice);
        }
    }
}

export default Store.Connect(IndiDriverSelector);

