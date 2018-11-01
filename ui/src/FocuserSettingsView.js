import React, { Component, PureComponent} from 'react';
import PropTypes from 'prop-types';
import { notifier, BackendStatus } from './Store';
import { connect } from 'react-redux';
import { atPath } from './shared/JsonPath';
import StatePropCond from './StatePropCond';
import TextEdit from './TextEdit';
import PropertyEditor from './PropertyEditor';
import './CameraView.css'




class FocuserSettingsView extends PureComponent {
    constructor(props) {
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

    static mapStateToProps(store, ownProps) {
        return ({});
    }
}

FocuserSettingsView = connect(FocuserSettingsView.mapStateToProps)(FocuserSettingsView);

FocuserSettingsView.propTypes = {
    // Path of the settings
    accessor: PropTypes.object.isRequired
}


export default FocuserSettingsView;