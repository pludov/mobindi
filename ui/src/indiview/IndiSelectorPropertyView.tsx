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
import * as Utils from "../Utils";
import "./IndiManagerView.css";
import { createSelector } from 'reselect';
import { IndiVector } from '@bo/BackOfficeStatus';


type InputProps = {
    dev: string;
    vec: string;
}

type MappedProps = {
    childNames: string[];
    childs: IndiVector["childs"];
}

type Props = InputProps & MappedProps;

// Render as a drop down selector
class IndiSelectorPropertyView extends React.PureComponent<Props> {
    render() {
        const options = [];
        let currentOption = undefined;

        for(const childId of this.props.childNames) {
            var child = this.props.childs[childId];

            options.push(<option key={child.$name} value={child.$name}>{child.$label}</option>);
            if (child.$_ == 'On') {
                currentOption = childId;
            }
        }
        return <select value={currentOption} onChange={this.updateVector}>
            {options}
        </select>;
    }

    private updateVector=async (e:React.ChangeEvent<HTMLSelectElement>)=> {
        const value = e.target.value;
        await BackendRequest.RootInvoker("indi")("updateVector")(CancellationToken.CONTINUE, {
            dev: this.props.dev,
            vec: this.props.vec,
            children: [
                {name: value, value: 'On'}
            ]
        });
    }

    static mapStateToProps:()=>(store: Store.Content, ownProps:InputProps)=>MappedProps = ()=>{
        return createSelector(
            (store: Store.Content, ownProps:InputProps)=>IndiUtils.getVectorDesc(store, ownProps.dev, ownProps.vec),
            (vec)=>
                vec === undefined
                    ?  {childs: {}, childNames: [] }
                    :  {childs: vec.childs, childNames: vec.childNames }
        );
    }
}

export default Store.Connect(IndiSelectorPropertyView);
