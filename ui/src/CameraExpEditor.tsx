import React, { Component, PureComponent} from 'react';
import { connect } from 'react-redux';
import { atPath } from './shared/JsonPath';
import * as PromiseSelector from './PromiseSelector';
import * as Utils from './Utils';
import * as Store from './Store';
import * as IndiUtils from './IndiUtils';

type InputProps = {
    // name of the device (indi id)
    device: string;
    // Location of the value in the store
    valuePath: string;
    // Function that build a promises
    setValue: (e:number)=>Promise<void>;
}

type MappedProps = PromiseSelector.Props<number> & {
    valuePath: string;
} & {
    $min: undefined
} & {
    $min: string;
    $max: string;
}

type Props = InputProps & MappedProps;

function ExpValueGenerator(props:Props) {
    var result:number[] = [];
    // Consider step as the min step.

    if (props.$min != undefined) {
        const min = parseFloat(props.$min);
        const max = parseFloat(props.$max);
        // Probably too simple for the moment
        const values = [ 0.001, 0.002, 0.005,0.01,0.02,0.05,0.1,0.2,0.5,1, 1.5, 2, 2.5, 3, 4, 5, 10, 20, 30, 60, 100, 120, 150, 180, 200, 240, 300];

        for(const o of values) {
            if (o >= min && o<= max) {
                result.push(o);
            }
        }

        if (!result.length) result.push(1);
    } else {
        result.push(1);
    }
    return result;
}

function ExpTitle(x:number) {
    if (x < 1) {
        return (1000*x) + "ms"
    }
    return x + "s";
}

const CameraExpEditor = connect((store: Store.Content, ownProps:InputProps) => {
    const indiDeviceDesc = Utils.noErr(()=>IndiUtils.getDeviceDesc(store, ownProps.device)!.CCD_EXPOSURE, undefined);
    return ({
        active: atPath(store, ownProps.valuePath),
        availablesGenerator: ExpValueGenerator,
        getTitle: ExpTitle,
        $min: atPath(indiDeviceDesc, '$.childs.CCD_EXPOSURE_VALUE["$min"]'),
        $max: atPath(indiDeviceDesc, '$.childs.CCD_EXPOSURE_VALUE["$max"]'),
    });
})(PromiseSelector.default)

export default CameraExpEditor;