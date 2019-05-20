import * as React from 'react';
import * as Store from "./Store";
import * as BackendRequest from "./BackendRequest";
import { atPath } from './shared/JsonPath';
import CancellationToken from 'cancellationtoken';
import "./DeviceConnectBton.css";

type InputProps = {
    // name of the device (indi id)
    activePath: string;
}

type MappedProps = {
    currentDevice: null|string;
    state: "NotFound"|"Busy"|"On"|"Off";
}

type State = {
    running: boolean;
}

type Props = InputProps & MappedProps;

// Display a connect/disconnect button for a device
class UnmappedDeviceConnectBton extends React.PureComponent<Props, State> {
    constructor(props:Props) {
        super(props);
        this.state = {running: false};
        this.switchConnection = this.switchConnection.bind(this);
    }

    render() {
        var enabled = false;
        let className;
        switch(this.props.state) {
            case 'On':
                className="DeviceConnectBtonOn";
                enabled = true;
                break;
            case 'Off':
                className='DeviceConnectBtonOff';
                enabled = true;
                break;
            case 'Busy':
                className="DeviceConnectBtonBusy";
                enabled = false;
            default:
                className="DeviceConnectBtonOther";
                enabled = false;
        }

        return <input type="button" className={"DeviceConnectBton " + className} onClick={this.switchConnection} disabled={!enabled} value={"\u23FB"}/>
    }

    async switchConnection() {
        const device = this.props.currentDevice;
        if (device === null) {
            return;
        }
        switch (this.props.state) {
            case 'On':
                await BackendRequest.RootInvoker("indi")("disconnectDevice")(CancellationToken.CONTINUE, {
                    device
                });
                break;
            case 'Off':
                await BackendRequest.RootInvoker("indi")("connectDevice")(CancellationToken.CONTINUE, {
                    device
                });
                break;
        }
    }


    static mapStateToProps(store: Store.Content, ownProps: InputProps):MappedProps {
        var currentDevice = atPath(store, ownProps.activePath);
        if (currentDevice === null || currentDevice === undefined) {
            return {
                currentDevice: null,
                state: "NotFound"
            }
        }


        var prop;
        try {
            const vec = store.backend.indiManager!.deviceTree[currentDevice].CONNECTION;

            if (vec.$state == "Busy") {
                return {
                    currentDevice,
                    state: "Busy"
                }
            }

            const prop = vec.childs.CONNECT;
            return {
                currentDevice,
                state : prop.$_ == "On" ? "On" : "Off",
            }
        } catch(e) {
            return {
                currentDevice,
                state: "NotFound",
            }
        }
    }
}

export default Store.Connect(UnmappedDeviceConnectBton);
