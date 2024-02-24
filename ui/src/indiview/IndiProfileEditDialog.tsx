/**
 * Created by ludovic on 21/07/17.
 */
import React, { } from 'react';
import * as Store from "../Store";
import * as BackendRequest from "../BackendRequest";
import IndiProfileAttributes, {HandledProps} from './IndiProfileAttributes';
import CancellationToken from 'cancellationtoken';
import { IndiProfileConfiguration } from '@bo/BackOfficeStatus';

type InputProps = {
    uid: string;
}

type MappedProps = HandledProps;

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

    render() {
        return (
            <>
                <div>
                    Edit profile <i>{this.props.name}</i>
                </div>
                <IndiProfileAttributes
                    name={this.props.name}
                    nameChanged={this.updateName}
                    />
            </>
        );
    }

    static mapStateToProps = (store:Store.Content, ownProps: InputProps)=>{
        const profile = store.backend.indiManager?.configuration?.profiles;
        if (profile && Object.prototype.hasOwnProperty.call(profile.byUid, ownProps.uid)) {
            const ret : Partial<IndiProfileConfiguration> = {...profile.byUid[ownProps.uid]}
            delete ret.uid;
            delete ret.active;
            delete ret.keys;
            return ret;
        }
        return {
            name: ""
        };
    }
};

export default Store.Connect(IndiProfileEditDialog);