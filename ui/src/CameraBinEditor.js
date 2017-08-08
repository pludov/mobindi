import React, { Component, PureComponent} from 'react';
import { notifier, BackendStatus } from './Store';
import { connect } from 'react-redux';
import { atPath } from './shared/SimplePath';
import PromiseSelector from './PromiseSelector';


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

// Descpath points to vector
const CameraBinSelector = connect((store, ownProps) => {
    var desc = atPath(store, ownProps.descPath);
    return ({
        active: atPath(store, ownProps.valuePath),
        availablesGenerator: BinValueGenerator,
        getTitle: BinTitle,
        $minx: atPath(desc, ['childs', 'HOR_BIN', '$min']),
        $maxx: atPath(desc, ['childs', 'HOR_BIN', '$max']),
        $stepx: atPath(desc, ['childs', 'HOR_BIN', '$step']),
        $miny: atPath(desc, ['childs', 'HOR_BIN', '$min']),
        $maxy: atPath(desc, ['childs', 'HOR_BIN', '$max']),
        $stepy: atPath(desc, ['childs', 'HOR_BIN', '$step']),
    });
})(PromiseSelector)

export default CameraBinSelector;