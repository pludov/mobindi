import React, { Component, PureComponent} from 'react';
import PropTypes from 'prop-types';
import { notifier, BackendStatus } from './Store';
import { connect } from 'react-redux';

import { atPath } from './shared/JsonPath';


class SequenceView extends PureComponent {
    constructor(props) {
        super(props);
    }
    render() {
        //var self = this;
        return(<div className="CameraView">Sequence !</div>);
    }
}


export default SequenceView;