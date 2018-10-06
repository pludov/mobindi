import React, { Component, PureComponent} from 'react';
import PropTypes from 'prop-types';
import { notifier, BackendStatus } from './Store';
import { connect } from 'react-redux';
import { atPath } from './shared/JsonPath';
import StatePropCond from './StatePropCond';
import TextEdit from './TextEdit';
import './CameraView.css'

class FocuserRangeEditor extends PureComponent {
    
    render() {
        let value = this.props.value;
        if (value === null) {
            value = "";
        }

        return <span className='cameraSetting'>
            Range:
                <TextEdit
                    value={value}
                    onChange={(e)=>this.props.accessor.send(parseFloat(e))}/>
        </span>;
    }

    static mapStateToProps(store, ownProps) {
        return ({
            value: ownProps.accessor.fromStore(store, "")
        });
    }
}
FocuserRangeEditor = connect(FocuserRangeEditor.mapStateToProps)(FocuserRangeEditor);
FocuserRangeEditor.propTypes = {
    accessor: PropTypes.object.isRequired
}

class FocuserStepEditor extends PureComponent {
    render() {
        return <span className='cameraSetting'>
            #step:
                <TextEdit
                    value={this.props.value}
                    onChange={(e)=>{
                        const i = parseInt(e);
                        if (i && !isNaN(i)) {
                            return this.props.accessor.send(i);
                        }
                        return null;
                    }}/>
        </span>;
    }

    static mapStateToProps(store, ownProps) {
        return ({
            value: ownProps.accessor.fromStore(store, "")
        });
    }
}
FocuserStepEditor = connect(FocuserStepEditor.mapStateToProps)(FocuserStepEditor);
FocuserStepEditor.propTypes = {
    accessor: PropTypes.object.isRequired
}

class FocuserSettingsView extends PureComponent {
    constructor(props) {
        super(props);
    }

    render() {
        // Range size
        return <div>
            <FocuserRangeEditor accessor={this.props.accessor.child("$.range")}/>
            <FocuserStepEditor accessor={this.props.accessor.child('$.steps')}/>
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