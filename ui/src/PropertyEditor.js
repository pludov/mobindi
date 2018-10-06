import React, { Component, PureComponent} from 'react';
import PropTypes from 'prop-types';
import { notifier, BackendStatus } from './Store';
import { connect } from 'react-redux';
import { atPath } from './shared/JsonPath';
import StatePropCond from './StatePropCond';
import TextEdit from './TextEdit';
import './CameraView.css'


class Text extends PureComponent {
    render() {
        let value = this.props.value;
        if (value === null) {
            value = "";
        }

        return <span className='cameraSetting'>
            {this.props.children}
                <TextEdit
                    value={value}
                    onChange={(e)=>this.update(e)}/>
        </span>;
    }

    xform(e) {
        return e;
    }

    update(e) {
        try {
            e = this.xform(e);
        } catch(e) {
            console.log(e.message);
            return;
        }
        this.props.accessor.send(e)
    }

    static mapStateToProps(store, ownProps) {
        return ({
            value: ownProps.accessor.fromStore(store, "")
        });
    }
}

class Int extends Text {
    xform(e)
    {
        e = parseInt(e);
        if (isNaN(e)) {
            throw new Error("int required");
        }
        if (this.props.min !== undefined && e < this.props.min) {
            throw new Error("Must be > " + this.props.min);
        }
        return e;
    }
}

Text = connect(Text.mapStateToProps)(Text);
Text.propTypes = {
    accessor: PropTypes.object.isRequired
};

Int = connect(Int.mapStateToProps)(Int);
Int.propTypes = {
    accessor: PropTypes.object.isRequired,
    min: PropTypes.int
};


export default { Text, Int };