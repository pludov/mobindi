import * as React from 'react';
import { defaultMemoize } from 'reselect';

import * as Utils from '../Utils';
import * as Help from '../Help';
import * as AccessPath from '../shared/AccessPath';
import * as Store from '../Store';
import * as SequenceStore from '../SequenceStore';
import Bool from '../primitives/Bool';
import SequenceStatMonitoringView from './SequenceStatMonitoringView';


type InputProps = {
    uid: string;
}

type MappedProps = {
    displayable: boolean;
}

type Props = InputProps & MappedProps;

type State = {
}

class SequenceFwhmMonitoringView extends React.PureComponent<Props, State> {
    private static enableFwhmMonitoringHelp = Help.key(
        "Activate monitoring of FWHM evolution (notification)"
    );

    constructor(props:Props) {
        super(props);
        this.state = {
        };
    }

    private sequenceAccessor = defaultMemoize(
        (uid:string)=>SequenceStore.sequenceAccessor(uid)
    );

    private fwhmMonitoringAccessor = defaultMemoize(
        (uid:string)=>this.sequenceAccessor(uid).child(AccessPath.For((e)=>e.fwhmMonitoring.enabled))
    );

    render() {
        if (!this.props.displayable) {
            return null;
        }
        return <>
            <div className="SequenceViewMonitoringConfig">
                <span>
                    <div className="IndiProperty">
                        <Bool
                            accessor={this.fwhmMonitoringAccessor(this.props.uid)}
                            helpKey={SequenceFwhmMonitoringView.enableFwhmMonitoringHelp}
                        /> Monitor FWHM evolution
                    </div>

                    <SequenceStatMonitoringView
                                    parameter="fwhm"
                                    uid={this.props.uid}
                                />
                </span>
            </div>
        </>;
    }

    static mapStateToProps:()=>(store: Store.Content, ownProps: InputProps)=>MappedProps=()=>{
        return (store: Store.Content, ownProps: InputProps)=> {
            const selected = ownProps.uid;
            const details = Utils.getOwnProp(store.backend.sequence?.sequences.byuuid, selected);
            if (details === undefined) {
                return {
                    displayable: false,
                };
            }

            return {
                displayable: true,
            };
        }
    }
}

export default Store.Connect(SequenceFwhmMonitoringView);
