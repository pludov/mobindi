/**
 * Created by ludovic on 21/07/17.
 */
import React, { } from 'react';
import * as Store from "../Store";
import { IndiProfilesConfiguration } from '@bo/BackOfficeStatus';
import * as Help from '../Help';
import * as BackendRequest from "../BackendRequest";
import Modal from '../Modal';
import IndiProfileNewDialog from './IndiProfileNewDialog';
import CancellationToken from 'cancellationtoken';

type InputProps = {
}

type MappedProps = {
    indiManagerProfiles: IndiProfilesConfiguration;
}

type Props = InputProps & MappedProps;


class IndiProfileDialog extends React.PureComponent<Props> {
    private static dropProfileBtonHelp = Help.key("Delete", "Delete a profile. Undo is not possible");

    private static cancelNewBtonHelp = Help.key("Cancel", "Cancel the creation of a new profile");
    private static saveNewConfirmBtonHelp = Help.key("Save", "Save the new profile");

    private newProfileDialogModal = React.createRef<Modal>();
    private newProfileDialog = React.createRef<IndiProfileNewDialog>();

    constructor(props:Props) {
        super(props);
    }

    switchProfile = async (uid: string)=>{
        await BackendRequest.RootInvoker("indi")("updateProfile")(
            CancellationToken.CONTINUE,
            {
                uid,
                active: !(this.props.indiManagerProfiles.byUid[uid]?.active)
            });
    };

    confirmDropProfile = (t: string)=> {
    };

    onNewProfileClick = ()=> {
        this.newProfileDialogModal.current!.open();
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
                        {profiles.map((profile)=>
                            <li key={profile}>
                                <input type='checkbox'
                                    checked={this.props.indiManagerProfiles.byUid[profile]?.active}
                                    onChange={()=>this.switchProfile(profile)}/>
                                {this.props.indiManagerProfiles.byUid[profile]?.name || profile}
                                <input className="GlyphBton" {...IndiProfileDialog.dropProfileBtonHelp.dom()}
                                        type='button' value='❌' onClick={()=>this.confirmDropProfile(profile)}/>
                            </li>)
                        }
                    </ul>
                </>
            }

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
            <input className="GlyphBton" {...IndiProfileDialog.dropProfileBtonHelp.dom()}
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