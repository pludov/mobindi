/**
 * Created by ludovic on 21/07/17.
 */
import React, { } from 'react';
import * as BackendRequest from "../BackendRequest";
import "./IndiManagerView.css";
import "../Collapsible.css";
import IndiProfileAttributes, {HandledProps} from './IndiProfileAttributes';
import CancellationToken from 'cancellationtoken';

type Props = {
    close: ()=>void;
}

type State = HandledProps;


class IndiProfileNewDialog extends React.PureComponent<Props, State> {
    constructor(props:Props) {
        super(props);
        this.state = {
            name: "",
        };
    }

    readonly save=async ()=>{
        if (!this.state.name) {
            return;
        }
        await BackendRequest.RootInvoker("indi")("createProfile")(
            CancellationToken.CONTINUE,
            {
                name: this.state.name
            });
        this.props.close();
    }

    render() {
        return (
            <>
                <div>
                    Enter settings for new profile
                </div>
                <IndiProfileAttributes
                    name={this.state.name}
                    nameChanged={(v)=>this.setState({name: v})}
                    />
            </>
        );
    }
};

export default IndiProfileNewDialog;