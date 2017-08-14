import React, { Component, PureComponent} from 'react';
import { notifier, BackendStatus } from './Store';
import { connect } from 'react-redux';
import { atPath } from './shared/JsonPath';
import PromiseSelector from './PromiseSelector';


function ExpValueGenerator(props) {
    var result = [];
    // Consider step as the min step.

    if (props.$min != undefined) {
        var min = parseFloat(props.$min);
        var max = parseFloat(props.$max);
        // Probably too simple for the moment
        var values = [ 0.001, 0.002, 0.005,0.01,0.02,0.05,0.1,0.2,0.5,1, 1.5, 2, 2.5, 3, 4, 5, 10, 20, 30, 60, 100, 120, 150, 180, 200, 240, 300];

        for(var o of values) {
            if (o >= min && o<= max) {
                result.push(o);
            }
        }

        if (!result) result.push(1);
    } else {
        result.push(1);
    }
    return result;
}

function ExpTitle(x) {
    if (x < 1) {
        return (1000*x) + "ms"
    }
    return x + "s";
}

// Descpath points to vector
const CameraExpEditor = connect((store, ownProps) => {
    var desc = atPath(store, ownProps.descPath);
    return ({
        active: atPath(store, ownProps.valuePath),
        availablesGenerator: ExpValueGenerator,
        getTitle: ExpTitle,
        $min: atPath(desc, '$.childs.CCD_EXPOSURE_VALUE["$min"]'),
        $max: atPath(desc, '$.childs.CCD_EXPOSURE_VALUE["$max"]'),
    });
})(PromiseSelector)

export default CameraExpEditor;