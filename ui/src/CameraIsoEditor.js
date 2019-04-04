import React, { Component, PureComponent} from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { atPath } from './shared/JsonPath';
import PromiseSelector from './PromiseSelector';
import * as Utils from './Utils';
import * as IndiUtils from './IndiUtils';

/*
    Unfortunately, iso are stored as meaningless strings. (ISO1, ISO2, ...)


          "CCD_ISO": {
            "$$": "defSwitchVector",
            "$device": "Canon DSLR EOS 450D (PTP mode)",
            "$name": "CCD_ISO",
            "$label": "ISO",
            "$group": "Image Settings",
            "$state": "Ok",
            "$perm": "rw",
            "$rule": "OneOfMany",
            "$timeout": "60",
            "$timestamp": "2017-08-14T07:24:31",
            "$type": "Switch",
            "childs": {
              "ISO0": {
                "$name": "ISO0",
                "$label": "Auto",
                "$_": "Off"
              },
              "ISO1": {
                "$name": "ISO1",
                "$label": "100",
                "$_": "Off"
              },
              "ISO2": {
                "$name": "ISO2",
                "$label": "200",
                "$_": "Off"
              },
              "ISO3": {
                "$name": "ISO3",
                "$label": "400",
                "$_": "Off"
              },
              "ISO4": {
                "$name": "ISO4",
                "$label": "800",
                "$_": "Off"
              },
              "ISO5": {
                "$name": "ISO5",
                "$label": "1600",
                "$_": "On"
              }
            },
            "childNames": [
              "ISO0",
              "ISO1",
              "ISO2",
              "ISO3",
              "ISO4",
              "ISO5"
            ]
          },
*/


function IsoValueGenerator(props) {
    var result = [];
    for(var i = 0; i < props.$itemCount; ++i)
    {
        result[i] = props['$item_' + i];
    }
    
    return result;
}

function IsoTitle(x) {
    return "" + x + " iso";
}

const CameraIsoEditor = connect((store, ownProps) => {
    var desc = Utils.noErr(()=>IndiUtils.getDeviceDesc(store, ownProps.device).CCD_ISO);

    var result = ({
        placeholder: 'ISO...',
        active: atPath(store, ownProps.valuePath),
        availablesGenerator: IsoValueGenerator,
        getTitle: IsoTitle
    });

    if (desc) {
        result.$itemCount = desc.childNames.length;
        for(var i = 0; i < desc.childNames.length; ++i)
        {
            var childId = desc.childNames[i];
            result['$item_' + i]= desc.childs[childId].$label;
        }
    } else {
        result.$itemCount = 0;
    }

    return result;
})(PromiseSelector)

CameraIsoEditor.propTypes = {
  // name of the device (indi id)
  device: PropTypes.string.isRequired,
  // Location of the value in the store
  valuePath: PropTypes.string.isRequired,
  // Function that build a promises
  setValue: PropTypes.func.isRequired
}

export default CameraIsoEditor;