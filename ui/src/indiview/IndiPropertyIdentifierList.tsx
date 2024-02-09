import React, { Component, PureComponent} from 'react';
import { connect } from 'react-redux';
import Log from '../shared/Log';
import * as Help from "../Help";
import * as Utils from "../Utils";
import { atPath } from '../shared/JsonPath';
import * as Store from "../Store";
import ArrayReselect from '../utils/ArrayReselect';
import ObjectReselect from '../utils/ObjectReselect';
import * as Actions from "../Actions";
import * as IndiManagerStore from "../IndiManagerStore";

import "./IndiManagerView.css";
import { IndiPropertyIdentifier } from '@bo/BackOfficeStatus';
import PromiseSelector, {Props as PromiseSelectorInputProps} from '../PromiseSelector';
import { defaultMemoize } from 'reselect';

const logger = Log.logger(__filename);

type InputProps = {
    accessor: Store.Accessor<IndiPropertyIdentifier|null>;
    onDone?: ()=>void;
}

type MappedProps = {
    device: string|null;
    vector: string|null;
    property: string|null;
}

type Props = InputProps & MappedProps;

type State = {
    device: string|null;
    vector: string|null;
    property: string|null;
    initialDevice: string|null;
    initialVector: string|null;
    initialProperty: string|null;
}

const deviceSelectorHelp = Help.key("Select INDI device", "Select a INDI device where to find the property");
const vectorSelectorHelp = Help.key("Select INDI vector", "Select a INDI vector where to find the property");
const propertySelectorHelp = Help.key("Select INDI property", "Select the INDI property to use");
const selectHelp = Help.key("Use the selected INDI property", "Use the selected INDI property and leave property selection");

type DeviceSelectorOwnProps = PromiseSelectorInputProps<string> & {
    possibles: string[]
};

const DeviceSelector = connect((store: Store.Content, ownProps:DeviceSelectorOwnProps) => {
    const deviceListGenerator = ArrayReselect.createArraySelector(IndiManagerStore.getDeviceList);

    return ((store: Store.Content, ownProps:DeviceSelectorOwnProps)=> {
        return ({
            ...ownProps,
            helpKey: deviceSelectorHelp,
            availables: deviceListGenerator(store)
        });
    })
})(PromiseSelector) as new (props:Partial<DeviceSelectorOwnProps>)=>(React.PureComponent<Partial<DeviceSelectorOwnProps>>)


type VectorSelectorOwnProps = PromiseSelectorInputProps<string> & {
    device: string;
    availables: string[],
    titles: {[id: string]:string},
};

const VectorSelector = connect((store: Store.Content, ownProps:VectorSelectorOwnProps) => {
    function getTitle(id: string, ownProps:VectorSelectorOwnProps) {
        return Utils.getOwnProp(ownProps.titles, id) || id;
    }

    const vectorTitlesGenerator = ObjectReselect.createObjectSelector((state: Store.Content, deviceId: string)=>IndiManagerStore.getVectorTitles(state, deviceId));

    const vectorListGenerator = defaultMemoize((titles: {[id: string]:string})=> {
        return Object.entries(titles).sort((a,b)=>(""+a[1]).localeCompare((""+b[1]))).map(a=>a[0]);
    });

    return ((store: Store.Content, ownProps:VectorSelectorOwnProps)=> {
        const titles = vectorTitlesGenerator(store, ownProps.device);

        return ({
            ...ownProps,
            helpKey: vectorSelectorHelp,
            titles,
            getTitle,
            availables: vectorListGenerator(titles),
        });
    })
})(PromiseSelector) as new (props:Partial<VectorSelectorOwnProps>)=>(React.PureComponent<Partial<VectorSelectorOwnProps>>)

type PropertySelectorOwnProps = PromiseSelectorInputProps<string> & {
    device: string;
    vector: string;
    availables: string[],
    titles: {[id: string]: string},
};

const PropertySelector = connect((store: Store.Content, ownProps:PropertySelectorOwnProps) => {
    function getTitle(id: string, ownProps:PropertySelectorOwnProps) {
        return Utils.getOwnProp(ownProps.titles, id) || id;
    }

    const propertyTitlesGenerator = ObjectReselect.createObjectSelector((state: Store.Content, deviceId: string, vectorId: string)=>IndiManagerStore.getPropertyTitles(state, deviceId, vectorId));
    const propertyListGenerator = ArrayReselect.createArraySelector((state: Store.Content, deviceId: string, vectorId: string)=>IndiManagerStore.getPropertyList(state, deviceId, vectorId));

    return ((store: Store.Content, ownProps:PropertySelectorOwnProps)=> {
        return ({
            ...ownProps,
            helpKey: propertySelectorHelp,
            titles: propertyTitlesGenerator(store, ownProps.device, ownProps.vector),
            availables: propertyListGenerator(store, ownProps.device, ownProps.vector),
            getTitle,
        });
    })
})(PromiseSelector) as new (props:Partial<PropertySelectorOwnProps>)=>(React.PureComponent<Partial<PropertySelectorOwnProps>>)



class IndiPropertySelector extends React.PureComponent<Props, State> {

    constructor(props:Props) {
        super(props);
        this.state = {
            device: null,
            vector:null,
            property: null,
            initialDevice: null,
            initialVector: null,
            initialProperty: null,
        }
    }

    setDevice=async(device:string)=>{
        this.setState({
            device,
            vector: null,
            property: null
        });
    }

    setVector=async(vector:string)=>{
        this.setState({
            vector,
            property: null
        });
    }

    setProperty=async(property:string)=>{
        this.setState({
            property
        });
    }

    apply=async()=> {
        if (this.state.device === null) return;
        if (this.state.vector === null) return;
        if (this.state.property === null) return;
        try {
            await this.props.accessor.send({
                device: this.state.device,
                vector: this.state.vector,
                property: this.state.property,
            });

            if (this.props.onDone) {
                this.props.onDone();
            }
        } catch(e) {
            logger.error("Unable to update value", e);
        }
    }

    render() {
        return <>
            <div>
                Device: <DeviceSelector active={this.state.device} helpKey={deviceSelectorHelp} setValue={this.setDevice}/>
            </div>
            {this.state.device !== null
                ? <>
                    <div>
                        Vector: <VectorSelector device={this.state.device} active={this.state.vector} setValue={this.setVector}/>
                    </div>
                    {this.state.vector !== null
                        ? <>
                            <div>
                                Property:
                                <PropertySelector device={this.state.device} vector={this.state.vector} active={this.state.property} setValue={this.setProperty}/>

                                {this.state.property !== null
                                    ? <input type="button" value="Select" onClick={this.apply} {...selectHelp.dom()}/>
                                    : null
                                }
                            </div>
                        </>
                        : null
                    }
                </>
                : null
            }
        </>
    }

    static getDerivedStateFromProps(props: MappedProps, prevState: State) {
        if (props.device === prevState.initialDevice
                && props.vector === prevState.initialVector
                && props.property === prevState.initialProperty) {
            return null;
        }
        return {
            device: props.device,
            vector: props.vector,
            property: props.property,
            initialDevice: props.device,
            initialVector: props.vector,
            initialProperty: props.property,
        }
    }

    static mapStateToProps(store:Store.Content, ownProps: InputProps):MappedProps {
        const current = ownProps.accessor.fromStore(store) || {
            device: null,
            vector: null,
            property: null
        }
        return {
            ...current,
        }
    }
}


export default Store.Connect(IndiPropertySelector);
