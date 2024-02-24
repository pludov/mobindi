/**
 * Created by ludovic on 21/07/17.
 */
import React, { } from 'react';
import * as Store from "../Store";
import { IndiProfilesConfiguration } from '@bo/BackOfficeStatus';
import Modal from '../Modal';
import IndiProfileDialog from './IndiProfileDialog';

type InputProps = {
}

type MappedProps = {
    indiManagerProfiles: IndiProfilesConfiguration;
}

type Props = InputProps & MappedProps;


class IndiProfileSelector extends React.PureComponent<Props> {
    private dialog = React.createRef<Modal>();

    constructor(props:Props) {
        super(props);
    }

    render() {
        const activeProfiles = this.props.indiManagerProfiles.list
                    .filter((e)=>this.props.indiManagerProfiles.byUid[e]?.active);

        return <>
            <select value={"current"} onChange={this.openDialog} className={activeProfiles.length == 0 ? "IndiNoPropfileSelector" : ""}>
                <option value="current">
                    {activeProfiles.length > 0 ?
                        (activeProfiles.length === 1 ? "Profile: " : "Profiles: ")
                         +  activeProfiles.map(
                                (e)=>(this.props.indiManagerProfiles.byUid[e]?.name || e)
                            ).join(", ")
                        : "No profile selected"
                    }
                </option>
                <option value="switch">✏️ Choose...</option>
            </select>
            <Modal ref={this.dialog} closeOnChange={""}>
                <IndiProfileDialog/>
            </Modal>
        </>
    }

    openDialog = ()=> {
        this.dialog.current!.open();
    }

    static mapStateToProps = (store:Store.Content, ownProps: InputProps)=>{
        return {
            indiManagerProfiles: store.backend.indiManager?.configuration.profiles,
        } as MappedProps;
    }
};

export default Store.Connect(IndiProfileSelector);