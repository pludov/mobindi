/**
 * Created by ludovic on 21/07/17.
 */
import React, { Component, PureComponent} from 'react';
import { atPath } from '../shared/JsonPath';
import * as Store from "../Store";
import * as Actions from "../Actions";

type InputProps = {
    valuePath: string;
    setValue: (value:null)=>(void);
}

type MappedProps = {
    visible: boolean;
}

type Props = InputProps & MappedProps;

type State = {
    forceVisibility: boolean;
};

class KeepValue extends React.PureComponent<Props, State> {
    constructor(props:Props) {
        super(props);
        this.state = { forceVisibility : false};
    }
    render() {
        return (<span>
            <input
                    type='checkbox'
                    checked={this.props.visible || this.state.forceVisibility}
                    onChange={(e)=>this.changeState(e.target.checked)}/>
            {this.props.visible || this.state.forceVisibility ? this.props.children: null}
        </span>)
    }

    changeState(to:boolean) {
        var self = this;
        if (to) {
            this.setState({forceVisibility: true});
        } else {
            this.setState({forceVisibility: false});
            // FIXME: not promise ready
            this.props.setValue(null);
        }
    }

    static mapStateToProps(store:Store.Content, ownProps: InputProps):MappedProps {
        var selected = atPath(store, ownProps.valuePath);
        return {
            visible: (selected !== undefined && selected !== null)
        };
    }
}

export default Store.Connect(KeepValue);

