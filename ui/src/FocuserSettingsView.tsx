import * as React from 'react';
import PropertyEditor from './PropertyEditor';
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
            <PropertyEditor.Int accessor={this.props.accessor.child('$.steps')} min="3">
                Steps#
            </PropertyEditor.Int>
            <PropertyEditor.Int accessor={this.props.accessor.child("$.range")} min="10">
                Range
            </PropertyEditor.Int>
            <PropertyEditor.Int accessor={this.props.accessor.child("$.backlash")} min="0">
                Backlash
            </PropertyEditor.Int>

            <PropertyEditor.Bool accessor={this.props.accessor.child("$.lowestFirst")}>
                Lowest first
            </PropertyEditor.Bool>
            <PropertyEditor.Bool accessor={this.props.accessor.child("$.targetCurrentPos")}>
                Start from current pos
            </PropertyEditor.Bool>
            <PropertyEditor.Conditional accessor={this.props.accessor.child("$.targetCurrentPos")}>
                <PropertyEditor.Int accessor={this.props.accessor.child("$.targetPos")} min="0">
                    Target Pos
                </PropertyEditor.Int>
            </PropertyEditor.Conditional>
        </div>;
    }
}
