/**
 * Created by ludovic on 21/07/17.
 */
import React, { } from 'react';
import CancellationToken from 'cancellationtoken';
import * as Store from "../Store";
import * as BackendRequest from "../BackendRequest";
import { IndiProfilePropertyConfiguration, IndiProfilesConfiguration, ProfilePropertyAssociation } from '@bo/BackOfficeStatus';
import "./IndiManagerView.css";
import { get3D } from '../shared/Obj';
import { defaultMemoize } from 'reselect';
import Modal from '../Modal';
import IndiPropertyProfileDialog from './IndiPropertyProfileDialog';

type InputProps = {
    dev: string;
    vec: string;
    prop: string|null;
    updateValue: (value:string)=>void;
}

type MappedProps = {
    lockGoTo: string|undefined;
    restriction: undefined|IndiProfilePropertyConfiguration;
    mismatch?: boolean;
}

type Props = InputProps & MappedProps;


/** Render a vector, depending on its type and access rules */
class IndiPropertyProfileStatus extends React.PureComponent<Props> {
    private advancedEditDialog = React.createRef<Modal>();

    constructor(props:Props) {
        super(props);
    }

    lockProperty = async ()=>{
        if (this.props.restriction !== undefined) {
            this.advancedEditDialog.current!.open();
            return;
        }
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

    closeDialogWithValue = (value?:string)=>{
        this.advancedEditDialog.current!.close();
        if (value !== undefined) {
            this.props.updateValue(value);
        }
    }

    public render() {
        return <div style={{float: "right", clear: "left"}}>
                <Modal ref={this.advancedEditDialog} closeOnChange={""}>
                    <IndiPropertyProfileDialog
                        dev={this.props.dev}
                        vec={this.props.vec}
                        prop={this.props.prop}
                        close={this.closeDialogWithValue}/>
                </Modal>
                <input className="GlyphBton"
                            type='button' value='🔒'
                            style={{
                                    filter: this.props.restriction ? undefined : 'grayscale(80%)',
                                    backgroundColor: this.props.mismatch ? 'red' : undefined,
                            }}
                            onClick={this.lockProperty}
                            />
            </div>;
    }

    public static mapStateToProps = ()=>{
        const statusGenerator = defaultMemoize((
                        dev:string, vec:string, prop:string|null,
                        profiles: IndiProfilesConfiguration|undefined,
                        status: ProfilePropertyAssociation<{wanted: string, profile: string}>|undefined)=>{
            if (!profiles) {
                return {};
            }
            let lockGoTo: string|undefined = undefined;
            const propStr = prop === null ? "...whole_vector..." : prop;
            for(const id of [...profiles.list].reverse()) {
                const profile = profiles.byUid[id];
                if (!profile.active) {
                    continue;
                }
                lockGoTo = id;

                const prop = get3D(profile.keys, dev, vec, propStr);
                if (prop) {
                    let r = status ? get3D(status, dev, vec, propStr) : undefined;
                    return {
                        restriction: prop,
                        mismatch: r !== undefined,
                        lockGoTo
                    };
                }
            }

            return {lockGoTo};
        });

        return (store:Store.Content, ownProps: InputProps) => {
            return statusGenerator(ownProps.dev, ownProps.vec, ownProps.prop,
                store.backend.indiManager?.configuration.profiles,
                store.backend.indiManager?.profileStatus.mismatches);
        }

    }
}

export default Store.Connect(IndiPropertyProfileStatus);
