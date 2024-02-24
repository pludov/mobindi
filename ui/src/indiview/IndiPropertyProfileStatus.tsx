/**
 * Created by ludovic on 21/07/17.
 */
import React, { } from 'react';
import CancellationToken from 'cancellationtoken';
import * as Store from "../Store";
import * as BackendRequest from "../BackendRequest";
import { IndiProfilePropertyConfiguration } from '@bo/BackOfficeStatus';
import "./IndiManagerView.css";

type InputProps = {
    dev: string;
    vec: string;
    prop: string|null;
}

type MappedProps = {
    lockGoTo: string|undefined;
    restriction: undefined|IndiProfilePropertyConfiguration;
}

type Props = InputProps & MappedProps;


/** Render a vector, depending on its type and access rules */
class IndiPropertyProfileStatus extends React.PureComponent<Props> {
    constructor(props:Props) {
        super(props);
    }

    lockProperty = async ()=>{
        if (!this.props.lockGoTo) {
            return;
        }
        await BackendRequest.RootInvoker("indi")("addToProfile")(
            CancellationToken.CONTINUE,
            {
                uid: this.props.lockGoTo,
                dev: this.props.dev,
                vec: this.props.vec,
                prop: this.props.prop
            });
    }

    public render() {
        return <div style={{float: "right", clear: "left"}}>
                <input className="GlyphBton"
                            type='button' value='🔒'
                            style={{filter: this.props.restriction ? undefined : 'grayscale(80%)'}}
                            onClick={this.lockProperty}
                            />
            </div>;
    }

    public static mapStateToProps(store: Store.Content, ownProps: InputProps) {
        const p = store.backend.indiManager?.configuration.profiles;
        if (!p) {
            return {};
        }
        let lockGoTo: string|undefined = undefined;
        for(const id of p.list) {
            const profile = p.byUid[id];
            if (!profile.active) {
                continue;
            }
            lockGoTo = id;

            const prop = profile.keys[ownProps.dev + "." + ownProps.vec + "." + ownProps.prop];
            if (prop) {
                return {
                    restriction: prop,
                    lockGoTo
                };
            }
        }

        return {lockGoTo};
    }
}

export default Store.Connect(IndiPropertyProfileStatus);
