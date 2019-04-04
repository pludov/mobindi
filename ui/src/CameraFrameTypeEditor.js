import React, { Component, PureComponent} from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { atPath } from './shared/JsonPath';
import PromiseSelector from './PromiseSelector';
import * as Utils from './Utils';
import * as IndiUtils from './IndiUtils';

function CameraFrameTypeTitle(x, props) {
    return Utils.noErr(()=>props.indiDeviceDesc.childs[x].$label, x);
}

const CameraFrameTypeSelector = connect((store, ownProps) => {
    var indiDeviceDesc = Utils.noErr(()=>IndiUtils.getDeviceDesc(store, ownProps.device).CCD_FRAME_TYPE);
    return ({
        indiDeviceDesc: indiDeviceDesc,
        active: atPath(store, ownProps.valuePath),
        availables: Utils.noErr(()=>(indiDeviceDesc.childNames)),
        getTitle: CameraFrameTypeTitle
    });
})(PromiseSelector)

CameraFrameTypeSelector.propTypes = {
    // name of the device (indi id)
    device: PropTypes.string.isRequired,
    // Location of the value in the store
    valuePath: PropTypes.string.isRequired,
    // Function that build a promises
    setValue: PropTypes.func.isRequired
}

export default CameraFrameTypeSelector;