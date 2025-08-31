/**
 * Created by ludovic on 21/07/17.
 */
import React, { } from 'react';
import * as Store from "../Store";
import { IndiProfilesConfiguration } from '@bo/BackOfficeStatus';
import * as Help from '../Help';
import * as BackendRequest from "../BackendRequest";
import Modal from '../Modal';
import IndiProfileNewDialog, { UnmappedIndiProfileNewDialog } from './IndiProfileNewDialog';
import CancellationToken from 'cancellationtoken';
import IndiProfileEditDialog from './IndiProfileEditDialog';
import "./IndiProfileDialog.css";

type InputProps = {
}

type MappedProps = {
    indiManagerProfiles: IndiProfilesConfiguration;
}

type Props = InputProps & MappedProps;

type State = {
    confirmDropProfile?: string;
    editProfile?: string;
}

class IndiProfileDialog extends React.PureComponent<Props, State> {
    private static dropProfileBtonHelp = Help.key("Delete", "Delete a profile. Undo is not possible");

    private static cancelNewBtonHelp = Help.key("Cancel", "Cancel the creation of a new profile");
    private static saveNewConfirmBtonHelp = Help.key("Save", "Save the new profile");

    private static cancelDropBtonHelp = Help.key("Cancel", "Cancel the deletion of the profile");
    private static confirmDropBtonHelp = Help.key("Delete", "Delete the profile");
    private static editProfileBtonHelp = Help.key("Edit", "Edit the profile");

    private static moveProfileUpBtonHelp = Help.key("Move Up", "Move the profile up in the list.\n When multiple profiles disagree, the last one in the list has precedence.");
    private static moveProfileDownBtonHelp = Help.key("Move Down", "Move the profile down in the list.\n When multiple profiles disagree, the last one in the list has precedence.");
    private static newProfileBtonHelp = Help.key("New profile", "Create a new empty profile");

    private dropProfileConfirmDialog = React.createRef<Modal>();
    private newProfileDialogModal = React.createRef<Modal>();
    private newProfileDialog = React.createRef<UnmappedIndiProfileNewDialog>();
    private editProfileDialog = React.createRef<Modal>();

    constructor(props:Props) {
        super(props);
        this.state = {};
    }

    switchProfile = async (uid: string)=>{
        await BackendRequest.RootInvoker("indi")("updateProfile")(
            CancellationToken.CONTINUE,
            {
                uid,
                active: !(this.props.indiManagerProfiles.byUid[uid]?.active)
            });
    };

    editProfile = (uid: string)=>{
        console.log('Going to edit', uid);
        this.setState({editProfile: uid},
            ()=>this.editProfileDialog.current!.open());
    }

    moveProfile = async (uid: string, direction: number)=>{
        console.log('Going to move', uid, direction);
        await BackendRequest.RootInvoker("indi")("moveProfile")(
            CancellationToken.CONTINUE,
            {
                uid,
                direction
            });
    }

    confirmDropProfile = (t: string)=> {
        console.log('Going to drop', t);
        this.setState({confirmDropProfile: t},
            ()=>this.dropProfileConfirmDialog.current!.open());
    };

    onNewProfileClick = ()=> {
        this.newProfileDialogModal.current!.open();
    }

    dropProfile = async ()=>{
        const uid = this.state.confirmDropProfile!;
        await BackendRequest.RootInvoker("indi")("deleteProfile")(
            CancellationToken.CONTINUE,
            {
                uid
            });
        this.setState({confirmDropProfile: undefined});
        this.dropProfileConfirmDialog.current!.close();
    }

    render() {
        const profiles = this.props.indiManagerProfiles.list;

        return (
            <>
            {profiles.length === 0 ?
                <div>No profile defined</div> :
                <>
                    <div>Select active profile(s):</div>
                    <ul>
                        {profiles.map((profile, index)=>
                            <li key={profile} className="profile_list_item">
                                <input type='checkbox'
                                    checked={this.props.indiManagerProfiles.byUid[profile]?.active}
                                    onChange={()=>this.switchProfile(profile)}/>
                                <span className="profile_list_title"> 
                                    {this.props.indiManagerProfiles.byUid[profile]?.name || profile}
                                </span>
                                <input className="GlyphBton"
                                    type="button" value="▲"
                                    onClick={()=>this.moveProfile(profile, -1)}
                                    disabled={index===0}
                                    {...IndiProfileDialog.moveProfileUpBtonHelp.dom()}
                                    />
                                <input className="GlyphBton"
                                    type="button" value="▼"
                                    onClick={()=>this.moveProfile(profile, 1)}
                                    disabled={index===profiles.length-1}
                                    {...IndiProfileDialog.moveProfileDownBtonHelp.dom()}
                                    />
                                <input className="GlyphBton"
                                    type='button' value='✏️'
                                    onClick={()=>this.editProfile(profile)}
                                    {...IndiProfileDialog.editProfileBtonHelp.dom()}
                                    />
                                <input className="GlyphBton"
                                    type='button' value='❌'
                                    onClick={()=>this.confirmDropProfile(profile)}
                                    {...IndiProfileDialog.dropProfileBtonHelp.dom()}
                                    />
                            </li>)
                        }
                    </ul>
                </>
            }
            <Modal ref={this.editProfileDialog} closeOnChange={""}>
                <IndiProfileEditDialog uid={this.state.editProfile!} />
            </Modal>

            <Modal ref={this.dropProfileConfirmDialog}
                closeHelpKey={IndiProfileDialog.cancelDropBtonHelp}
                closeOnChange={this.state.confirmDropProfile}
                controlButtons={
                    <input type="button"
                        onClick={(e)=>this.dropProfile()}
                        value={IndiProfileDialog.confirmDropBtonHelp.title}
                        {...IndiProfileDialog.confirmDropBtonHelp.dom()}>
                    </input>
                }>
                <div>
                    Do you really want to delete the profile
                    &nbsp;

                    <i>
                        {this.props.indiManagerProfiles.byUid[this.state.confirmDropProfile!]?.name || this.state.confirmDropProfile}
                    </i> ?
                </div>
            </Modal>

            <Modal ref={this.newProfileDialogModal} closeOnChange={""}
                closeHelpKey={IndiProfileDialog.cancelNewBtonHelp}
                controlButtons={
                    <input type="button"
                        onClick={(e)=>this.newProfileDialog.current!.save()}
                        value={IndiProfileDialog.saveNewConfirmBtonHelp.title}
                        {...IndiProfileDialog.saveNewConfirmBtonHelp.dom()}>
                    </input>
                }>

                <IndiProfileNewDialog
                    ref={this.newProfileDialog}
                    close={()=>this.newProfileDialogModal.current!.close()}/>

            </Modal>
            <input className="GlyphBton" {...IndiProfileDialog.newProfileBtonHelp.dom()}
                                type='button' value='⭐New profile' onClick={this.onNewProfileClick}/>
            </>
        );
    }

    static mapStateToProps = (store:Store.Content, ownProps: InputProps)=>{
        return {
            indiManagerProfiles: store.backend.indiManager?.configuration.profiles,
        } as MappedProps;
    }
};

export default Store.Connect(IndiProfileDialog);