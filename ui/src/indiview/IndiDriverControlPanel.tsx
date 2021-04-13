/**
 * Created by ludovic on 21/07/17.
 */
import React, { Component, PureComponent} from 'react';
import CancellationToken from 'cancellationtoken';
import * as Help from "../Help";
import * as Store from "../Store";
import * as Actions from "../Actions";
import * as BackendRequest from "../BackendRequest";
import * as IndiManagerStore from "../IndiManagerStore";
import * as Utils from "../Utils";
import Modal from '../Modal';
import IndiDriverConfig from '../IndiDriverConfig';
import "./IndiManagerView.css";
import DeviceSettingsBton from '../DeviceSettingsBton';
import DeviceConnectBton from '../DeviceConnectBton';

type InputProps = {
}

type MappedProps = {
    current: string;
    configured: boolean;
    indiDeviceExists: boolean;
}

type Props = InputProps & MappedProps;

class IndiDriverControlPanel extends React.PureComponent<Props> {
    static restartBtonHelp = Help.key("Restart driver", "Kill & restart the selected INDI driver (use with caution)");

    constructor(props:Props) {
        super(props);
    }

    private restart = async ()=> {
        await BackendRequest.RootInvoker("indi")("restartDriver")(CancellationToken.CONTINUE, {driver: this.props.current});
    }

    render() {
        return <span>
            {this.props.indiDeviceExists
                ? <DeviceConnectBton deviceId={this.props.current}/>
                : null
            }

            {this.props.indiDeviceExists
                ? <DeviceSettingsBton deviceId={this.props.current}/>
                : null
            }

            {this.props.configured
                ? <input type='button'
                        onClick={this.restart}
                        {...IndiDriverControlPanel.restartBtonHelp.dom()}
                        className='IndiRestartButton'
                        value={'\u21bb'}/>
                : null
            }
        </span>;
    }

    static mapStateToProps(store:Store.Content, props: InputProps):MappedProps {
        const backend = store.backend.indiManager;

        const currentDevice = store.indiManager.selectedDevice || "";

        const configuredDevices = backend?.configuration?.indiServer?.devices;
        const configured = Utils.has(configuredDevices, currentDevice);

        const indiDeviceExists = Utils.has(backend?.deviceTree, currentDevice);
        return {
            current: currentDevice,
            configured: configured,
            indiDeviceExists
        };
    }
}

export default Store.Connect(IndiDriverControlPanel);
