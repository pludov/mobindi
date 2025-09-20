/**
 * Created by ludovic on 21/07/17.
 */
import React, { } from 'react';
import * as BackendRequest from "../BackendRequest";
import * as Store from "../Store";
import "./IndiManagerView.css";
import "../Collapsible.css";
import IndiProfileAttributes, {HandledProps} from './IndiProfileAttributes';
import CancellationToken from 'cancellationtoken';
import { getProfileList } from '../IndiProfileStore';

type InputProps = {
    close: ()=>void;
}

type MappedProps = {
    exclusionGroupPotentials: ReturnType<ReturnType<typeof getProfileList>>;
}

type Props = InputProps & MappedProps;

type State = HandledProps;

export class UnmappedIndiProfileNewDialog extends React.PureComponent<Props, State> {
    constructor(props:Props) {
        super(props);
        this.state = {
            name: "",
            exclusionGroupPeers: [],
            systemDeviceIdentifier: null,
            systemDeviceLogic: false,
        };
    }

    readonly save=async ()=>{
        if (!this.state.name) {
            return;
        }
        const uid = await BackendRequest.RootInvoker("indi")("createProfile")(
            CancellationToken.CONTINUE,
            {
                name: this.state.name
            });
        if (this.state.exclusionGroupPeers.length > 0) {
            await BackendRequest.RootInvoker("indi")("updateProfileExclusionGroup")(
                CancellationToken.CONTINUE,
                {
                    uid, // new profile uid is its name
                    otherUids: this.state.exclusionGroupPeers
                });
        }
        this.props.close();
    }

    readonly updateExclusionGroup = async(exclusionGroupPeers: Array<string>) => {
        this.setState({exclusionGroupPeers});
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
                    exclusionGroupPeers={this.state.exclusionGroupPeers}
                    exclusionGroupChanged={this.updateExclusionGroup}
                    exclusionGroupPotentials={this.props.exclusionGroupPotentials}
                    systemDeviceLogic={this.state.systemDeviceLogic}
                    systemDeviceIdentifier={this.state.systemDeviceIdentifier}
                    systemDeviceChanged={(e)=>this.setState(e)}
                    />
            </>
        );
    }


    static mapStateToProps = () =>{
        const getAllProfiles = getProfileList();

        return (store:Store.Content) => {
            return {
                exclusionGroupPotentials: getAllProfiles(store),
            }
        }
    }
};

export default Store.Connect<UnmappedIndiProfileNewDialog, InputProps, {}, MappedProps>(UnmappedIndiProfileNewDialog);