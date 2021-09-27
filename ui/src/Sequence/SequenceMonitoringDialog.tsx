import * as React from 'react';
import { defaultMemoize } from 'reselect';

import { SequenceActivityMonitoring } from '@bo/BackOfficeStatus';

import * as Utils from '../Utils';
import * as Help from '../Help';
import * as AccessPath from '../shared/AccessPath';
import * as Store from '../Store';
import * as SequenceStore from '../SequenceStore';
import * as BackendRequest from '../BackendRequest';
import TextEdit from "../TextEdit";
import * as SequenceStepParameter from "./SequenceStepParameter";
import CancellationToken from 'cancellationtoken';
import Bool from '@src/primitives/Bool';


type InputProps = {
    uid: string;
    onClose: ()=>void;
}

type MappedProps = {
    displayable: boolean;
    title: string;
    activityMonitoring: SequenceActivityMonitoring;
}

type Props = InputProps & MappedProps;

type State = {
}

class SequenceMonitoringDialog extends React.PureComponent<Props, State> {
    private static closeBtonHelp = Help.key("Close", "Return to the sequence list. Changes are saved as they are made.");

    constructor(props:Props) {
        super(props);
        this.state = {
        };
    }

    private sequenceAccessor = defaultMemoize(
        (uid:string)=>SequenceStore.sequenceAccessor(uid)
    );

    private activityMonitoringAccessor = defaultMemoize(
        (uid:string)=>this.sequenceAccessor(uid).child(AccessPath.For((e)=>e.activityMonitoring.enabled))
    );

    render() {
        if (!this.props.displayable) {
            return null;
        }
        return <div className="Modal">
            <div className="ModalContent">
                <div className="IndiProperty">
                        Monitoring for: {this.props.title}
                </div>


                <div className="IndiProperty">
                    <Bool
                        accessor={this.activityMonitoringAccessor(this.props.uid)}
                    /> Stuck in light exposure for more than XXX seconds
                </div>


                <input type='button' value='Close' onClick={this.props.onClose} {...SequenceMonitoringDialog.closeBtonHelp.dom()}/>
            </div>
        </div>;
    }

    static mapStateToProps:()=>(store: Store.Content, ownProps: InputProps)=>MappedProps=()=>{
        return (store: Store.Content, ownProps: InputProps)=> {
            const selected = ownProps.uid;
            const details = Utils.getOwnProp(store.backend.sequence?.sequences.byuuid, selected);
            if (details === undefined) {
                return {
                    displayable: false,
                    title: "not found",
                    activityMonitoring: {enabled: false},
                };
            }
            const { activityMonitoring, title } = {...details};
            return {
                displayable: true,
                activityMonitoring,
                title
            };
        }
    }
}

export default Store.Connect(SequenceMonitoringDialog);
