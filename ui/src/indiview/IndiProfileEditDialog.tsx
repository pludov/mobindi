/**
 * Created by ludovic on 21/07/17.
 */
import React, { } from 'react';
import * as Store from "../Store";
import * as BackendRequest from "../BackendRequest";
import IndiProfileAttributes, {HandledProps} from './IndiProfileAttributes';
import CancellationToken from 'cancellationtoken';
import { IndiProfileConfiguration, IndiProfilesConfiguration } from '@bo/BackOfficeStatus';
import { defaultMemoize } from 'reselect';
import { getProfileList, getProfileExclusionGroup, getExclusionGroupPotentialPeers } from '../IndiProfileStore';

type InputProps = {
    uid: string;
}

type MappedProps = HandledProps & {
    exclusionGroupPotentials: ReturnType<ReturnType<typeof getProfileList>>;
}

type Props = InputProps & MappedProps;


class IndiProfileEditDialog extends React.PureComponent<Props> {
    constructor(props:Props) {
        super(props);
        this.state = {
            name: "",
        };
    }

    readonly updateName=async (name: string)=>{
        if (!name) {
            return;
        }
        await BackendRequest.RootInvoker("indi")("updateProfile")(
            CancellationToken.CONTINUE,
            {
                uid: this.props.uid,
                name
            });
    }

    readonly updateSystemDevice = async(e: Pick<IndiProfileConfiguration, "systemDeviceLogic"|"systemDeviceIdentifier">) => {
        console.log('Updating system device', e);
        await BackendRequest.RootInvoker("indi")("updateProfile")(
            CancellationToken.CONTINUE,
            {
                uid: this.props.uid,
                ...e
            });
    }

    readonly updateExclusionGroup = async(otherUids: Array<string>) => {
        await BackendRequest.RootInvoker("indi")("updateProfileExclusionGroup")(
            CancellationToken.CONTINUE,
            {
                uid: this.props.uid,
                otherUids
            });
    }

    render() {
        return (
            <>
                <div>
                    Edit profile <i>{this.props.name}</i>
                </div>
                <IndiProfileAttributes
                    name={this.props.name}
                    exclusionGroupPeers={this.props.exclusionGroupPeers}
                    systemDeviceIdentifier={this.props.systemDeviceIdentifier}
                    systemDeviceLogic={this.props.systemDeviceLogic}
                    nameChanged={this.updateName}
                    exclusionGroupChanged={this.updateExclusionGroup}
                    exclusionGroupPotentials={this.props.exclusionGroupPotentials}
                    systemDeviceChanged={this.updateSystemDevice}
                    />
            </>
        );
    }

    static mapStateToProps = () =>{

        const mapFromProfile = defaultMemoize((profile: IndiProfilesConfiguration|undefined, uid: string)=> {
            if (profile && Object.prototype.hasOwnProperty.call(profile.byUid, uid)) {
                const ret : Partial<IndiProfileConfiguration> = {...profile.byUid[uid]}
                delete ret.uid;
                delete ret.active;
                delete ret.keys;

                const exclusionGroup = ret.exclusionGroup;
                delete ret.exclusionGroup;

                return ret;
            }
            return {
                name: ""
            };
        });

        const peers = getProfileExclusionGroup();
        const potentialPeers = getExclusionGroupPotentialPeers();

        return (store:Store.Content, ownProps: InputProps) => {
            const profile = store.backend.indiManager?.configuration?.profiles ;
            return {
                ...mapFromProfile(profile, ownProps.uid),
                exclusionGroupPeers: peers(store, ownProps.uid),
                exclusionGroupPotentials: potentialPeers(store, ownProps.uid),
            }
        }
    }
};

export default Store.Connect(IndiProfileEditDialog);