import React, { Component, PureComponent} from 'react';
import { connect } from 'react-redux';
import { atPath } from './shared/SimplePath';

import PropTypes from 'prop-types';


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
        var value = atPath(store, ownProps.path);
        var result = ownProps.condition(value);
        return ({
            active: result == true
        });
    }
}

StatePropCond = connect(StatePropCond.mapStateToProps)(StatePropCond);

StatePropCond.exists = function(value) {
    return value != undefined;
}

StatePropCond.defaultProps = {
    condition: StatePropCond.exists
}

StatePropCond.propTypes = {
    path: PropTypes.array.isRequired,
    condition: PropTypes.func,
}

export default StatePropCond;
