import React, { Component, PureComponent} from 'react';
import PropTypes from 'prop-types';

import { notifier, BackendStatus } from './Store';
import { connect } from 'react-redux';


import FitsViewer from './FitsViewer';


class FitsViewerInContext extends PureComponent {
    constructor(props) {
        super(props);
        this.saveViewSettings = this.saveViewSettings.bind(this);
    }

    saveViewSettings(e) {
        this.props.app.setViewerState(this.props.contextKey, e);
    }

    render() {
        return <FitsViewer app={this.props.app} src={this.props.src} viewSettings={this.props.viewSettings} onViewSettingsChange={this.saveViewSettings}/>
    }
}

FitsViewerInContext = connect((store, ownProps) => ({
    viewSettings: ownProps.app.getViewerState(store, ownProps.contextKey)
}))(FitsViewerInContext);

FitsViewerInContext.propTypes = {
    src: PropTypes.string.isRequired,
    contextKey: PropTypes.string.isRequired,
    app: PropTypes.any
}

export default FitsViewerInContext;
