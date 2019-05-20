import * as React from 'react';
import Modal from './Modal';
import * as DeviceIdMapper from './indiview/DeviceIdMapper';

import IndiDriverConfig from './IndiDriverConfig';
import "./DeviceSettingsBton.css";

type Props = {
    deviceId: string;
}

// Display a connect/disconnect button for a device
export default class DeviceSettingsBton extends React.PureComponent<Props> {
    private modal = React.createRef<Modal>();
    constructor(props:Props) {
        super(props);
    }

    private config = ()=> {
        this.modal.current!.open();
    }

    render() {
        return <>
            <input type="button" onClick={this.config} disabled={this.props.deviceId === null} className="DeviceSettingsBton" value={"\u2699"}/>
            {this.props.deviceId !== null
                ? <Modal ref={this.modal}>
                    <IndiDriverConfig driverId={this.props.deviceId!} />
                </Modal>
                : null
            }
        </>;
    }

    static readonly forActivePath = DeviceIdMapper.forActivePath<{deviceId: string|null}>(DeviceSettingsBton);
}


// export default Store.Connect(UnmappedDeviceSettingsBton);
