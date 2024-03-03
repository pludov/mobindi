/**
 * Created by ludovic on 21/07/17.
 */
import React, { } from 'react';
import * as Store from "../Store";
import * as BackendRequest from '../BackendRequest';
import * as Help from '../Help';
import { IndiProfilesConfiguration } from '@bo/BackOfficeStatus';
import Modal from '../Modal';
import IndiProfileDialog from './IndiProfileDialog';
import CancellationToken from 'cancellationtoken';

type InputProps = {
}

type MappedProps = {
    fixNumber: number|undefined;
}

type Props = InputProps & MappedProps;


class IndiProfileGlobalStatus extends React.PureComponent<Props> {
    private static fixBtonHelp = Help.key("Apply profiles", "Update all the properties from the selected profile");

    constructor(props:Props) {
        super(props);
    }

    fixClicked = async ()=>{
        await BackendRequest.RootInvoker("indi")("applyActiveProfiles")(
            CancellationToken.CONTINUE,
            {
            });
    }

    render() {
        if (this.props.fixNumber === undefined) {
            return "???";
        }

        if (this.props.fixNumber === 0) {
            return "✅conform"
        }
        return <>
            <input className="GlyphBton"
                    type='button'
                    value={`⚡ Fix ${this.props.fixNumber} props`}
                    onClick={this.fixClicked}
                    {...IndiProfileGlobalStatus.fixBtonHelp.dom()}
                    />

        </>
    }

    static mapStateToProps = (store:Store.Content, ownProps: InputProps)=>{
        return {
            fixNumber: store.backend?.indiManager?.profileStatus?.totalMismatchCount,
        };
    }
};

export default Store.Connect(IndiProfileGlobalStatus);