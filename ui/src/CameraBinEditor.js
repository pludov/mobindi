import React, { Component, PureComponent} from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { atPath } from './shared/JsonPath';
import PromiseSelector from './PromiseSelector';
import * as Utils from './Utils';
import * as IndiUtils from './IndiUtils';


function BinValueGenerator(props) {
    var result = [];
    if (props.$minx != undefined && parseFloat(props.$stepx) == 1 && parseFloat(props.$stepy) == 1) {
        var step =  parseFloat(props.$stepx);
        var min = Math.max(parseFloat(props.$minx), parseFloat(props.$miny));
        var max = Math.min(parseFloat(props.$maxx), parseFloat(props.$maxy));

        for(var i = min; i <= max && result.length < 1000; i += step)
        {
            result.push(i);
        }
        if (!result) result.push(1);
    } else {
        result.push(1);
    }
    return result;
}

function BinTitle(x) {
    return "bin" + x;
}

const CameraBinSelector = connect((store, ownProps) => {
    var desc = Utils.noErr(()=>IndiUtils.getDeviceDesc(store, ownProps.device).CCD_BINNING);
    return ({
        active: atPath(store, ownProps.valuePath),
        availablesGenerator: BinValueGenerator,
        getTitle: BinTitle,
        $minx: atPath(desc, '$.childs.HOR_BIN["$min"]'),
        $maxx: atPath(desc, '$.childs.HOR_BIN["$max"]'),
        $stepx: atPath(desc, '$.childs.HOR_BIN["$step"]'),
        $miny: atPath(desc, '$.childs.VER_BIN["$min"]'),
        $maxy: atPath(desc, '$.childs.VER_BIN["$max"]'),
        $stepy: atPath(desc, '$.childs.VER_BIN["$step"]'),
    });
})(PromiseSelector)

CameraBinSelector.propTypes = {
    // name of the device (indi id)
    device: PropTypes.string.isRequired,
    // Location of the value in the store
    valuePath: PropTypes.string.isRequired,
    // Function that build a promises
    setValue: PropTypes.func.isRequired
}

export default CameraBinSelector;