import React, { Component, PureComponent} from 'react';
import PropTypes from 'prop-types';

import { connect } from 'react-redux';


import * as Actions from "./Actions";
import * as Store from "./Store";
import * as FitsViewerStore from "./FitsViewerStore";
import FitsViewer from './FitsViewer/FitsViewer';


class FitsViewerInContext extends PureComponent {
    fitsViewer = React.createRef();
    constructor(props) {
        super(props);
    }

    saveViewSettings=(e)=>{
        Actions.dispatch/*<FitsViewerStore.Actions>*/("setViewerState")({
            context: this.props.contextKey,
            viewSettings: e
        });
    }

    render() {
        return <FitsViewer ref={this.fitsViewer} app={this.props.app} src={this.props.src} viewSettings={this.props.viewSettings} onViewSettingsChange={this.saveViewSettings} contextMenu={this.props.contextMenu}/>
    }
}

FitsViewerInContext = connect((store, ownProps) => ({
    viewSettings: FitsViewerStore.getViewerState(store, ownProps.contextKey)
}), null, null, { forwardRef: true })(FitsViewerInContext);

FitsViewerInContext.propTypes = {
    src: PropTypes.string.isRequired,
    contextKey: PropTypes.string.isRequired,
    contextMenu: PropTypes.any,
    app: PropTypes.any
}

export default FitsViewerInContext;
