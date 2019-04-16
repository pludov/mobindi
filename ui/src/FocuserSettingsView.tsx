import * as React from 'react';
import Bool from './primitives/Bool';
import Int from './primitives/Int';
import Text from './primitives/Text';
import Conditional from './primitives/Conditional';
import './CameraView.css'
import BackendAccessor from './utils/BackendAccessor';

type Props = {
    accessor: BackendAccessor;
}

export default class FocuserSettingsView extends React.PureComponent<Props> {
    constructor(props:Props) {
        super(props);
    }

    render() {
        // Range size
        return <div>
            <Int accessor={this.props.accessor.child('$.steps')} min={3}>
                Steps#
            </Int>
            <Int accessor={this.props.accessor.child("$.range")} min={10}>
                Range
            </Int>
            <Int accessor={this.props.accessor.child("$.backlash")} min={0}>
                Backlash
            </Int>

            <Bool accessor={this.props.accessor.child("$.lowestFirst")}>
                Lowest first
            </Bool>
            <Bool accessor={this.props.accessor.child("$.targetCurrentPos")}>
                Start from current pos
            </Bool>
            <Conditional accessor={this.props.accessor.child("$.targetCurrentPos")}>
                <Int accessor={this.props.accessor.child("$.targetPos")} min={0}>
                    Target Pos
                </Int>
            </Conditional>
        </div>;
    }
}
