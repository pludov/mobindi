/**
 * Created by ludovic on 21/07/17.
 */
import React, { } from 'react';
import CancellationToken from 'cancellationtoken';
import * as Store from "../Store";
import * as Help from '../Help';
import * as BackendRequest from "../BackendRequest";
import { IndiProfilePropertyConfiguration, IndiProfilesConfiguration, ProfilePropertyAssociation } from '@bo/BackOfficeStatus';
import "./IndiManagerView.css";
import { get3D } from '../shared/Obj';
import { defaultMemoize } from 'reselect';

type InputProps = {
    dev: string;
    vec: string;
    prop: string|null;
    close: (value?:string)=>void;
}

type PerProfileProp = {
    profile_uid:string,
    profile_name: string,
    profile_value:undefined|string,
    apply:boolean,
    mismatch: boolean,
}

type MappedProps = {
    profiles: Array<PerProfileProp>;
    controller_name: string|undefined;
    mismatch: boolean;
}

type Props = InputProps & MappedProps;


/** Render a vector, depending on its type and access rules */
class IndiPropertyProfileDialog extends React.PureComponent<Props> {

    private static fixBtonHelp = Help.key("Correct the system", "Send the expected value to the device");
    private static forgetBtonHelp = Help.key("Remove from profile", "Forget the value in this profile");
    private static addBtonHelp = Help.key("Add to profile", "Record the current value in this profile");

    constructor(props:Props) {
        super(props);
    }

    lockProperty = async (profileUid: string)=>{
        await BackendRequest.RootInvoker("indi")("addToProfile")(
            CancellationToken.CONTINUE,
            {
                uid: profileUid,
                dev: this.props.dev,
                vec: this.props.vec,
                prop: this.props.prop
            });
    }

    unlockProperty = async (profileUid: string)=>{
        await BackendRequest.RootInvoker("indi")("removeFromProfile")(
            CancellationToken.CONTINUE,
            {
                uid: profileUid,
                dev: this.props.dev,
                vec: this.props.vec,
                prop: this.props.prop
            });
    }

    private fixProperty = async ()=>{
        const appliedProfile = this.props.profiles.find(p=>p.apply);
        if (!appliedProfile) {
            return;
        }
        this.props.close(appliedProfile.profile_value);
    }

    public render() {
        const appliedProfile = this.props.profiles.find(p=>p.apply);
        return <div>
            {appliedProfile !== undefined ?
                <>
                    <div>
                        Prop is controlled by profile: <u>{appliedProfile.profile_name}</u><br/>
                    </div>
                    {!appliedProfile.mismatch ?
                        <div>
                            The current value is <span style={{color: "green"}}>conform</span> ({appliedProfile.profile_value})<br/>
                        </div>

                    :
                        <div>
                            The current value is <span style={{color: "red"}}>not conform</span>;
                            expected value is : {appliedProfile.profile_value}

                            <input className="GlyphBton"
                                type='button' value='⚡ Fix'
                                onClick={this.fixProperty}
                                {...IndiPropertyProfileDialog.fixBtonHelp.dom()}
                                />
                        </div>
                    }
                </>
            :
                <div>
                    Value is not controlled by any profile<br/>
                </div>
            }

            <div>
            Details:
            </div>
            <ul>
                {this.props.profiles.map((p, i)=>
                    <li key={i}>
                        Profile: <u>{p.profile_name}</u><br/>
                        Expected value: {
                            p.profile_value === undefined ?
                                <i>not set</i> :
                                <span style={{color: p.mismatch ? "red" : "green"}}>{p.profile_value}</span>
                            }
                        <br/>

                        {p.profile_value !== undefined &&
                            <input type="button" value='❌ forget' className="PhdControlBton"
                                onClick={()=>this.unlockProperty(p.profile_uid)}
                                {...IndiPropertyProfileDialog.forgetBtonHelp.dom()}
                            />
                        }
                        {p.profile_value === undefined &&
                            <input type="button" value='📝 add' className="PhdControlBton"
                                onClick={()=>this.lockProperty(p.profile_uid)}
                                {...IndiPropertyProfileDialog.addBtonHelp.dom()}
                            />
                        }
                    </li>
                )}
            </ul>
        </div>;
    }

    public static mapStateToProps = ()=>{
        const statusGenerator = defaultMemoize((
                        dev:string, vec:string, prop:string|null,
                        profiles: IndiProfilesConfiguration|undefined,
                        status: ProfilePropertyAssociation<{wanted: string, profile: string}>|undefined)=>{

            const ret:MappedProps = {
                profiles: [],
                mismatch: false,
                controller_name: undefined,
            }

            if (!profiles) {
                return ret;
            }

            const propStr = prop === null ? "...whole_vector..." : prop;
            let applied: boolean = false;
            for(const id of [...profiles.list].reverse()) {
                const profile = profiles.byUid[id];
                if (!profile.active) {
                    continue;
                }

                const propInProfile = get3D(profile.keys, dev, vec, propStr);
                const profileItem: PerProfileProp = {
                    profile_uid: id,
                    profile_name: profile.name,
                    profile_value: propInProfile?.value,
                    apply: (!applied) && propInProfile !== undefined,
                    mismatch: false,
                };
                if (profileItem.apply) {
                    applied = true;
                    ret.controller_name = profile.name;
                    let r = status ? get3D(status, dev, vec, propStr) : undefined;
                    if (r) {
                        profileItem.mismatch = true;
                        ret.mismatch = true;
                    }
                }

                ret.profiles.push(profileItem);
            }

            return ret;
        });

        return (store:Store.Content, ownProps: InputProps) => {
            return statusGenerator(ownProps.dev, ownProps.vec, ownProps.prop,
                store.backend.indiManager?.configuration.profiles,
                store.backend.indiManager?.profileStatus.mismatches);
        }

    }
}

export default Store.Connect(IndiPropertyProfileDialog);
