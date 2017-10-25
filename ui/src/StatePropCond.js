import React, { Component, PureComponent} from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import * as Utils from './Utils';
import * as IndiUtils from './IndiUtils';

/* Render the child depending on a value in the store */
class StatePropCond extends PureComponent {
    constructor(props) {
        super(props);
    }

    render()
    {
        if (this.props.active) {
            return React.Children.only(this.props.children);
        } else {
             return null;
        }
    }

    static mapStateToProps = function(store, ownProps) {
        if (ownProps.override !== undefined) {
            return {
                active: ownProps.override
            }
        }
        var desc = Utils.noErr(()=>IndiUtils.getDeviceDesc(store, ownProps.device)[ownProps.property]);
        var result = ownProps.condition(desc);
        return ({
            active: result == true
        });
    }
}

StatePropCond = connect(StatePropCond.mapStateToProps)(StatePropCond);

StatePropCond.exists = function(value) {
    return value !== undefined;
}

StatePropCond.defaultProps = {
    condition: StatePropCond.exists
}

StatePropCond.propTypes = {
    device: PropTypes.string.isRequired,
    property: PropTypes.string.isRequired,
    override: PropTypes.bool,
    condition: PropTypes.func,
}

export default StatePropCond;
