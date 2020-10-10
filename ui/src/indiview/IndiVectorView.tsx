/**
 * Created by ludovic on 21/07/17.
 */
import React, { Component, PureComponent} from 'react';
import CancellationToken from 'cancellationtoken';
import * as Store from "../Store";
import * as Actions from "../Actions";
import * as BackendRequest from "../BackendRequest";
import * as IndiManagerStore from "../IndiManagerStore";
import * as IndiUtils from '../IndiUtils';
import { IndiVector, IndiProperty } from '@bo/BackOfficeStatus';
import * as BackOfficeAPI from '@bo/BackOfficeAPI';
import IndiSelectorPropertyView from "./IndiSelectorPropertyView";
import IndiPropertyView from "./IndiPropertyView";
import "./IndiManagerView.css";
import IconButton from '../IconButton';
import Icons from '../Icons';
import Led from '../Led';

type InputProps = {
    dev: string;
    vec: string;
}

type MappedProps = {
    state: IndiVector["$state"];
    label: IndiVector["$label"];
    type: IndiVector["$type"];
    rule: IndiVector["$rule"];
    perm: IndiVector["$perm"];
    childs: IndiVector["childNames"];
}

type Props = InputProps & MappedProps;

type State = {
    pendingChange: boolean;
} | {
    [id: string]:boolean;
}

const VectorStateToColor = {
    Idle: 'grey',
    Ok: 'green',
    Busy: 'yellow',
    Alert: 'red'
}

/** Render a vector, depending on its type and access rules */
class IndiVectorView extends React.PureComponent<Props, State> {
    constructor(props:Props) {
        super(props);
        this.state = {
            pendingChange: false
        };
        this.pushMultiValue = this.pushMultiValue.bind(this);
        this.changeCallback = this.changeCallback.bind(this);
    }

    private pendingChangesIds=()=>{
        const rslt = [];
        for(const o of Object.keys(this.state)) {
            if (o.startsWith("forced_") && this.state[o] !== undefined) {
                const id = o.substring(7);
                rslt.push(id);
            }
        }
        return rslt;
    }


    private cancelPendingChanges=()=>{
        const newState:State = {
            pendingChange: false
        };
        for(const id of this.pendingChangesIds()) {
            newState["forced_" + id] = undefined;
        }
        this.setState(newState);
    }

    private doneRequest=(request:BackOfficeAPI.UpdateIndiVectorRequest)=>{
        this.cancelPendingChanges();
    }

    private pushMultiValue = async ()=>{
        const req:BackOfficeAPI.UpdateIndiVectorRequest = {
            dev: this.props.dev,
            vec: this.props.vec,
            children: []
        };
        const newState = {};
        for(const o of Object.keys(this.state)) {
            if (o.startsWith("forced_") && this.state[o] !== undefined) {
                const id = o.substring(7);
                const value = this.state[o];
                newState[o] = undefined;
                req.children.push({name: id, value: value});
            }
        }

        this.setState(newState);
        await BackendRequest.RootInvoker("indi")("updateVector")(
            CancellationToken.CONTINUE,
            req
        );
        this.doneRequest(req);
    }

    private changeCallback = async(id:string, immediate:boolean, value:string)=>{
        if ((!immediate) && this.props.childs.length > 1) {
            // Do nothing for now
            this.setState({
                ["forced_" + id]: value,
                pendingChange: true
            });
        } else {
            // Direct push of the value
            const request:BackOfficeAPI.UpdateIndiVectorRequest = {
                dev: this.props.dev,
                vec: this.props.vec,
                children: [
                    {name: id, value: value}
                ]
            };
            await BackendRequest.RootInvoker("indi")("updateVector")(
                CancellationToken.CONTINUE,
                request
            );
            this.doneRequest(request);
        }
    }

    // props: app
    // props: dev
    // props: vec
    public render() {
        const ledColor = VectorStateToColor[this.props.state] || VectorStateToColor['Alert'];

        let content;
        if (this.props.type == 'Switch' && this.props.rule == 'OneOfMany' && this.props.perm != "ro") {
            content = <div className="IndiProperty">{this.props.label}:
                <IndiSelectorPropertyView dev={this.props.dev} vec={this.props.vec}/>
            </div>;
        } else if (this.props.childs.length > 0) {
            content = this.props.childs.map(
                (id) => <IndiPropertyView dev={this.props.dev}
                                showVecLabel={this.props.childs.length == 1}
                                onChange={this.changeCallback}
                                vec={this.props.vec} prop={id} key={'child_' + id}
                                forcedValue={this.state["forced_" + id]}/>);
            if (this.props.childs.length > 1) {
                content.splice(0, 0,
                        <div
                            key='$$$title$$$'
                            className="IndiVectorTitle">
                                {this.props.label}
                                {this.props.perm == 'ro' ? null :
                                    <IconButton
                                        src={Icons.dialogOk}
                                        onClick={this.pushMultiValue}
                                        visible={this.state.pendingChange}/>
                                }
                                {this.props.perm == 'ro' ? null :
                                    <IconButton
                                        src={Icons.dialogCancel}
                                        onClick={this.cancelPendingChanges}
                                        visible={this.state.pendingChange}/>
                                }
                        </div>
                        );
            }
        } else {
            content = <div className="IndiProperty">{this.props.label}&gt;</div>;
        }

        return <div className="IndiVector"><Led color={ledColor}/><div className="IndiVectorProps">{content}</div></div>
    }

    public static mapStateToProps(store: Store.Content, ownProps: InputProps) {
        let rslt:MappedProps;
        const vec = IndiUtils.getVectorDesc(store, ownProps.dev, ownProps.vec);

        if (vec != undefined) {
            rslt = {
                label: vec.$label,
                state: vec.$state,
                type: vec.$type,
                rule: vec.$rule,
                perm: vec.$perm,
                childs: vec.childNames
            }
        } else {
            rslt = {
                label: "N/A",
                state: 'Error',
                perm: "",
                rule: "",
                type: "Switch",
                childs: []
            }
        }
        return rslt;
    }
}

export default Store.Connect(IndiVectorView);
