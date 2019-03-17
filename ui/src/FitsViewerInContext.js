import React, { Component, PureComponent} from 'react';
import PropTypes from 'prop-types';

import { notifier, BackendStatus } from './Store';
import { connect } from 'react-redux';


import FitsViewer from './FitsViewer/FitsViewer';


class FitsViewerInContext extends PureComponent {
    fitsViewer = React.createRef();
    constructor(props) {
        super(props);
        this.saveViewSettings = this.saveViewSettings.bind(this);
    }

    saveViewSettings(e) {
        this.props.app.setViewerState(this.props.contextKey, e);
    }

    updateLayout() {
        this.fitsViewer.current.updateLayout();
    }

    render() {
        return <FitsViewer ref={this.fitsViewer} app={this.props.app} src={this.props.src} viewSettings={this.props.viewSettings} onViewSettingsChange={this.saveViewSettings} contextMenu={this.props.contextMenu}/>
    }
}

FitsViewerInContext = connect((store, ownProps) => ({
    viewSettings: ownProps.app.getViewerState(store, ownProps.contextKey)
}), null, null, { forwardRef: true })(FitsViewerInContext);

FitsViewerInContext.propTypes = {
    src: PropTypes.string.isRequired,
    contextKey: PropTypes.string.isRequired,
    contextMenu: PropTypes.any,
    app: PropTypes.any
}

export default FitsViewerInContext;
