/**
 * Created by ludovic on 21/07/17.
 */
import React, { ChangeEvent } from 'react';
import * as Store from "./Store";
import * as BackendRequest from "./BackendRequest";
import CancellationToken from 'cancellationtoken';
import { IndiProfileConfiguration, IndiProfilesConfiguration } from '@bo/BackOfficeStatus';
import { defaultMemoize } from 'reselect';
import { SystemDeviceList, SystemDevicePartialList } from '@bo/BackOfficeAPI';


type HandledProps = {
    systemDeviceIdentifier: Array<StateFilter>,
    systemDeviceLogic: IndiProfileConfiguration['systemDeviceLogic'],
}

type Props = HandledProps & {
    onChange: (e: Partial<HandledProps>)=>void
}

type StateFilter = {
    key: string,
    value: string|undefined,
}

type State = {
    devices: undefined|SystemDevicePartialList,
}

/**
 * Contain a set of filter in the form key: value
 */
export default class SystemDeviceFilterEditorModal extends React.PureComponent<Props, State> {
    private currentStreamCanceler?: ()=>void;
    private currentStreamFilter?: HandledProps['systemDeviceIdentifier'];

    constructor(props:Props) {
        super(props);
        this.state = {
            devices: undefined,
        }
        this.currentStreamCanceler = undefined;
        this.currentStreamFilter = undefined;
    }

    private async fetchDevices(c : CancellationToken, filter: Array<StateFilter>, stopped: ()=>boolean, onDone: ()=>void) {

        const criteria = Object.fromEntries(filter.filter(e=>e.value !== undefined).map(e=>[e.key, e.value!]))

        const stream = BackendRequest.RootStreamer("systemDeviceManager")("watchDevice")({criteria});
        const reader = stream.getReader();
        const cancelCanceller = c.onCancelled(() => {
            console.log('Token got cancelation request');
            reader.cancel();
        });
        try {
            while(!stopped()) {
                const {done, value }  = await reader.read();
                if (done) {
                    break;
                }
                console.log('Received', value);
                this.setState({devices: value});
            }
        } catch(e) {
            console.log('Stream error', e);
        } finally {
            console.log('streaming promise done');
            cancelCanceller();
            onDone();
        }
    }

    startStream = (filter: undefined|HandledProps['systemDeviceIdentifier']) => {
        console.log('Starting streaming', filter);
        this.currentStreamFilter = filter;
        if (filter !== undefined) {
            const {token, cancel} = CancellationToken.create();
            this.currentStreamCanceler = cancel;

            this.fetchDevices(token, filter, () => {
            return this.currentStreamCanceler !== cancel;
            }, () => {
                if (this.currentStreamCanceler === cancel) {
                    this.currentStreamCanceler = undefined;
                }
            });
        } else {
            this.currentStreamCanceler = undefined;
        }
    }

    stopStream = () => {
        console.log('Stopping streaming');
        if (this.currentStreamCanceler) {
            const t = this.currentStreamCanceler;
            this.currentStreamCanceler = undefined;
            t();
        }
    }


    // Open stream when component becomes visible
    componentDidMount() {
        this.startStream(this.props.systemDeviceIdentifier);
    }

    componentDidUpdate(prevProps: Readonly<Props>, prevState: Readonly<State>, snapshot?: any): void {
        const newStreamFilter = this.props.systemDeviceLogic === null ? undefined : this.props.systemDeviceIdentifier;
        if (newStreamFilter !== this.currentStreamFilter) {
            this.stopStream();
            this.startStream(newStreamFilter);
        }
    }

    componentWillUnmount() {
        this.stopStream();
    }


    addFilter=(e : ChangeEvent<HTMLSelectElement>)=> {
        const systemDeviceIdentifier = [...this.props.systemDeviceIdentifier, {
            key: e.target.value,
            value: undefined
        }];

        this.props.onChange({systemDeviceIdentifier});
    }

    updateDeviceLogic=(e:ChangeEvent<HTMLSelectElement>) => {
        const value = e.target.value;
        const systemDeviceLogic = value === "" ? null : value === "true";
        this.props.onChange({systemDeviceLogic});
    }

    updateFilter=(id: number, e:ChangeEvent<HTMLSelectElement>) => {
        let value = e.target.value;
        if (!value.startsWith("val:")) {
            return;
        }
        value = value.substring(4);

        const systemDeviceIdentifier = [...this.props.systemDeviceIdentifier];
        systemDeviceIdentifier[id] = {
            ...systemDeviceIdentifier[id],
            value
        };

        this.props.onChange({systemDeviceIdentifier});
    }

    dropFilter=(id:number) => {
        const systemDeviceIdentifier = [...this.props.systemDeviceIdentifier];
        systemDeviceIdentifier.splice(id, 1);
        this.props.onChange({systemDeviceIdentifier});
    }

    render() {

        let availableProps = Object.keys(this.state.devices?.props || {});
        console.log(availableProps);
        availableProps.sort();

        let existingFilters : Array<StateFilter|null> = [...this.props.systemDeviceIdentifier];
        if (availableProps.length) {
            // null is the "create" selector
            existingFilters.push(null);
        }
        console.log(existingFilters);
        return (<div>
            Auto activate profile:
            <select
                value={this.props.systemDeviceLogic === null ? "" : "" + this.props.systemDeviceLogic}
                onChange={this.updateDeviceLogic}>
                <option value="">Disabled</option>
                <option value="true">When device is present</option>
                <option value="false">When device is not present</option>
            </select>

            {this.props.systemDeviceLogic !== null ?
                <>
                <table>
                    <tbody>

                        {existingFilters.map((v, id) =>

                            (v !== null)
                                ?
                                    <tr key={id}>
                                        <td>
                                            {v.key}
                                        </td>
                                        <td>
                                            <select onChange={(e)=>this.updateFilter(id, e)} value={v.value}>
                                                {
                                                    v.value === undefined
                                                        ? <option disabled selected>Select value for {v.key}...</option>
                                                        : null
                                                }
                                                {
                                                    (this.state.devices?.props[v.key] || []).map((value)=>
                                                        <option key={value} value={`val:${value}`}>{value}</option>
                                                    )
                                                }
                                                {
                                                    v.value !== undefined && (this.state.devices?.props[v.key] || []).indexOf(v.value) === -1
                                                        ? <option key={v.value} value={`val:${v.value}`}>{v.value}</option>
                                                        : null
                                                }

                                            </select>
                                        </td>
                                        <td>
                                            <input className="GlyphBton"  type='button' value='❌' onClick={(e)=>this.dropFilter(id)}/>
                                        </td>
                                    </tr>
                                :
                                    <tr key={id}>
                                        <td colSpan={3}>
                                            <select key={id} onChange={this.addFilter}>
                                                <option disabled selected>Add a criteria</option>
                                                {availableProps.map((v)=> <option key={v} value={v}>{v}</option>)}
                                            </select>
                                        </td>
                                    </tr>


                        )}
                    </tbody>

                </table>
            

                Matching connected devices:<br/>
                <table>
                    <tbody>
                    {(this.state.devices?.items || []).length === 0 ?
                        <tr>
                            <td>
                                No matching device found
                            </td>
                        </tr>
                        :
                        null
                    }

                    {this.state.devices?.items?.map((value,index)=> {
                        return <tr key={index}>
                            <td>
                                {value.title}
                            </td>

                        </tr>

                    })}
                    {this.state.devices?.more ?
                        <tr>
                            <td>
                                More...
                            </td>
                        </tr>
                        :null
                    }

                    </tbody>

                </table>
                </>
            :
                null
            }
        </div>);
    }
}

