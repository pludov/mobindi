import React from 'react';
import CancellationToken from 'cancellationtoken';
import { IndiDeviceConfiguration, IndiServerConfiguration } from '@bo/BackOfficeStatus';
import * as BackendRequest from '../BackendRequest';
import * as Help from '../Help';
import Log from '../shared/Log';
import * as Store from '../Store';

const logger = Log.logger(__filename);

type InputProps = {};

type MappedProps = {
    driverToGroup: {[driver: string]: string}|undefined;
    driverToName: {[driver: string]: string}|undefined;
    indiServer: IndiServerConfiguration|undefined;
}

type Props = InputProps & MappedProps;

type State = {
    group: string;
    driver: string;
    id: string;
    pendingRemoval?: string;
    error?: string;
}

const autorunHelp = Help.key('Start INDI server automatically', 'When enabled, Mobindi starts and manages the INDI server automatically.');
const groupHelp = Help.key('Select driver group', 'Choose the group containing the INDI driver to add.');
const driverHelp = Help.key('Select driver', 'Choose the INDI driver to add. The option shows its display and executable names.');
const idHelp = Help.key('Device ID', 'Choose the device name that INDI will use. A unique name based on the executable is proposed.');
const addHelp = Help.key('Add device', 'Add a configured INDI device using the selected driver and ID.');
const removeHelp = Help.key('Remove device', 'Remove this device from the INDI server configuration.');
const confirmRemoveHelp = Help.key('Remove device and hidden settings', 'Confirm removal and discard this device’s additional configuration.');
const cancelRemoveHelp = Help.key('Cancel removal', 'Keep this device and its additional configuration.');

export function proposeDeviceId(driver: string, devices: IndiServerConfiguration['devices']): string {
    const base = driver || 'device';
    if (!Object.prototype.hasOwnProperty.call(devices, base)) {
        return base;
    }

    let suffix = 2;
    while (Object.prototype.hasOwnProperty.call(devices, `${base}-${suffix}`)) {
        suffix++;
    }
    return `${base}-${suffix}`;
}

export function hasHiddenConfiguration(device: IndiDeviceConfiguration): boolean {
    return ['config', 'skeleton', 'prefix'].some((key) => Object.prototype.hasOwnProperty.call(device, key))
        || Object.keys(device.options || {}).length > 0;
}

class IndiServerConfigurationEditor extends React.PureComponent<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = {
            group: '',
            driver: '',
            id: '',
        };
    }

    private reportError = (action: string, error: unknown) => {
        logger.error(action, error);
        this.setState({error: error instanceof Error ? error.message : String(error)});
    }

    private setAutorun = async (autorun: boolean) => {
        try {
            await BackendRequest.RootInvoker('indi')('updateIndiServerAutorun')(
                CancellationToken.CONTINUE,
                {autorun}
            );
            this.setState({error: undefined});
        } catch(e) {
            this.reportError('Unable to update INDI server autorun setting', e);
        }
    }

    private addDevice = async () => {
        const id = this.state.id.trim();
        if (!this.state.driver || !id) {
            return;
        }
        try {
            await BackendRequest.RootInvoker('indi')('addIndiServerDevice')(
                CancellationToken.CONTINUE,
                {id, driver: this.state.driver}
            );
            this.setState({driver: '', id: '', error: undefined});
        } catch(e) {
            this.reportError('Unable to add INDI device', e);
        }
    }

    private removeDevice = async (id: string, confirmHiddenConfiguration = false) => {
        try {
            await BackendRequest.RootInvoker('indi')('removeIndiServerDevice')(
                CancellationToken.CONTINUE,
                {id, confirmHiddenConfiguration}
            );
            this.setState({pendingRemoval: undefined, error: undefined});
        } catch(e) {
            this.reportError(`Unable to remove INDI device "${id}"`, e);
        }
    }

    private changeGroup = (group: string) => {
        this.setState({group, driver: '', id: ''});
    }

    private changeDriver = (driver: string) => {
        this.setState({
            driver,
            id: driver ? proposeDeviceId(driver, this.props.indiServer?.devices || {}) : '',
        });
    }

    private renderDevice(id: string, device: IndiDeviceConfiguration) {
        const driver = device.driver;
        const name = this.props.driverToName?.[driver];
        const title = name ? `${name} (${driver})` : driver;
        const hiddenConfiguration = hasHiddenConfiguration(device);
        const isPendingRemoval = this.state.pendingRemoval === id;

        return <li key={id} className="IndiServerConfigurationDevice">
            <div className="IndiServerConfigurationDeviceRow">
                <span>{id} — {title}</span>
                <input
                    type="button"
                    value="✖"
                    onClick={() => hiddenConfiguration
                        ? this.setState({pendingRemoval: id, error: undefined})
                        : this.removeDevice(id)}
                    {...removeHelp.dom()}
                />
            </div>
            {isPendingRemoval
                ? <div className="IndiServerConfigurationWarning">
                    <p>
                        Removing <strong>{id}</strong> will also discard its additional configuration
                        (such as config files, skeletons, prefixes, or options). This cannot be undone.
                    </p>
                    <input
                        type="button"
                        value="Remove"
                        onClick={() => this.removeDevice(id, true)}
                        {...confirmRemoveHelp.dom()}
                    />
                    <input
                        type="button"
                        value="Cancel"
                        onClick={() => this.setState({pendingRemoval: undefined})}
                        {...cancelRemoveHelp.dom()}
                    />
                </div>
                : null
            }
        </li>;
    }

    render() {
        const {driverToGroup, driverToName, indiServer} = this.props;
        if (!driverToGroup || !driverToName || !indiServer) {
            return null;
        }
        const configuration = indiServer;
        const devices = configuration.devices || {};
        const groups = Array.from(new Set(Object.values(driverToGroup))).sort();
        const drivers = Object.keys(driverToGroup)
            .filter((driver) => driverToGroup[driver] === this.state.group)
            .sort((a, b) => {
                const titleA = driverToName[a] || a;
                const titleB = driverToName[b] || b;
                return titleA.localeCompare(titleB);
            });
        const deviceList = Object.keys(devices).sort().map((id) => this.renderDevice(id, devices[id]));
        return <div className="IndiServerConfigurationEditor">
            <label className="IndiServerConfigurationAutorun" {...autorunHelp.dom()}>
                <input
                    type="checkbox"
                    checked={configuration.autorun}
                    onChange={(e) => this.setAutorun(e.target.checked)}
                    {...autorunHelp.dom()}
                />
                Start INDI server automatically
            </label>

            <h3>Configured devices</h3>
            {deviceList.length
                ? <ul className="IndiServerConfigurationDevices">{deviceList}</ul>
                : <div>No devices configured.</div>
            }

            <h3>Add a device</h3>
            <div className="IndiServerConfigurationAdd">
                <label>
                    Group
                    <select
                        value={this.state.group}
                        onChange={(e) => this.changeGroup(e.target.value)}
                        {...groupHelp.dom()}
                    >
                        <option value="">Select a group...</option>
                        {groups.map((group) => <option key={group} value={group}>{group}</option>)}
                    </select>
                </label>
                <label>
                    Driver
                    <select
                        value={this.state.driver}
                        onChange={(e) => this.changeDriver(e.target.value)}
                        disabled={!this.state.group}
                        {...driverHelp.dom()}
                    >
                        <option value="">Select a driver...</option>
                        {drivers.map((driver) => {
                            const name = driverToName[driver] || driver;
                            return <option key={driver} value={driver}>{name} ({driver})</option>;
                        })}
                    </select>
                </label>
                <label>
                    ID
                    <input
                        type="text"
                        value={this.state.id}
                        onChange={(e) => this.setState({id: e.target.value})}
                        disabled={!this.state.driver}
                        {...idHelp.dom()}
                    />
                </label>
                <input
                    type="button"
                    value="Add"
                    onClick={this.addDevice}
                    disabled={!this.state.driver || !this.state.id.trim() || Object.prototype.hasOwnProperty.call(devices, this.state.id.trim())}
                    {...addHelp.dom()}
                />
            </div>

            {this.state.error
                ? <div className="IndiServerConfigurationError" role="alert">{this.state.error}</div>
                : null
            }
        </div>;
    }

    static mapStateToProps(store: Store.Content, ownProps: InputProps): MappedProps {
        return {
            driverToGroup: store.backend.indiManager?.driverToGroup,
            driverToName: store.backend.indiManager?.driverToName,
            indiServer: store.backend.indiManager?.configuration.indiServer,
        };
    }
}

export default Store.Connect(IndiServerConfigurationEditor);
