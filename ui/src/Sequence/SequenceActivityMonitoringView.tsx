import * as React from 'react';
import { defaultMemoize } from 'reselect';

import { SequenceActivityMonitoring } from '@bo/BackOfficeStatus';

import * as Utils from '../Utils';
import * as Help from '../Help';
import * as AccessPath from '../shared/AccessPath';
import * as Store from '../Store';
import * as SequenceStore from '../SequenceStore';
import CancellationToken from 'cancellationtoken';
import Bool from '@src/primitives/Bool';
import Float from '@src/primitives/Float';


type InputProps = {
    uid: string;
}

type MappedProps = {
    displayable: boolean;
    activityMonitoring: SequenceActivityMonitoring;
}

type Props = InputProps & MappedProps;

type State = {
}

class SequenceActivityMonitoringView extends React.PureComponent<Props, State> {
    private static enableActivityMonitoringHelp = Help.key(
        "Activity monitoring",
        "Emit a notification if the sequence is not progressing for longer than this duration. " +
        "This includes all time spent between exposures, including focuser, dithering, image transfert. " +
        "The actual exposure duration is not accounted for."
    );
    private static activityMonitoringDurationHelp = Help.key(
        "Inactivity thresold",
        "Maximum number of seconds expected between exposures. " +
        "This must be large enough to cover duration of dithering, filter switch, image transfert, ... " +
        "The actual exposure duration is not accounted for."
    );

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

    private activityMonitoringDurationAccessor = defaultMemoize(
        (uid:string)=>new Store.UndefinedToNullAccessor(this.sequenceAccessor(uid).child(AccessPath.For((e)=>e.activityMonitoring.duration)))
    );

    render() {
        if (!this.props.displayable) {
            return null;
        }
        return <div className="SequenceViewMonitoringConfig">
                <div className="IndiProperty">
                    <Bool
                        accessor={this.activityMonitoringAccessor(this.props.uid)}
                        helpKey={SequenceActivityMonitoringView.enableActivityMonitoringHelp}
                    /> Warn when no progress in sequence for more than

                    <Float
                        accessor={this.activityMonitoringDurationAccessor(this.props.uid)}
                        helpKey={SequenceActivityMonitoringView.activityMonitoringDurationHelp}
                    /> seconds.
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

export default Store.Connect(SequenceActivityMonitoringView);
