import * as React from 'react';
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
    $minx: undefined
} & {
    $minx: string;
    $miny: string;
    $maxx: string;
    $maxy: string;
    $stepx: string;
    $stepy: string;
}

type Props = InputProps & MappedProps;

function BinValueGenerator(props: Props) {
    const result:number[] = [];
    if (props.$minx !== undefined && parseFloat(props.$stepx) == 1 && parseFloat(props.$stepy) == 1) {
        var step =  parseFloat(props.$stepx);
        var min = Math.max(parseFloat(props.$minx), parseFloat(props.$miny));
        var max = Math.min(parseFloat(props.$maxx), parseFloat(props.$maxy));

        for(var i = min; i <= max && result.length < 1000; i += step)
        {
            result.push(i);
        }
        if (!result.length) result.push(1);
    } else {
        result.push(1);
    }
    return result;
}

function BinTitle(x:number) {
    return "bin" + x;
}

const CameraBinSelector = connect((store: Store.Content, ownProps: InputProps) => {
    const desc = Utils.noErr(()=>IndiUtils.getDeviceDesc(store, ownProps.device)!.CCD_BINNING, undefined);
    const root = {
            active: atPath(store, ownProps.valuePath),
            availablesGenerator: BinValueGenerator,
            getTitle: BinTitle,
    }
    if (desc === undefined) {
         return {
            ...root,
            $minx: undefined
         }
    } else {
        return {
            ... root,
            $minx: atPath(desc, '$.childs.HOR_BIN["$min"]'),
            $maxx: atPath(desc, '$.childs.HOR_BIN["$max"]'),
            $stepx: atPath(desc, '$.childs.HOR_BIN["$step"]'),
            $miny: atPath(desc, '$.childs.VER_BIN["$min"]'),
            $maxy: atPath(desc, '$.childs.VER_BIN["$max"]'),
            $stepy: atPath(desc, '$.childs.VER_BIN["$step"]'),
        }
    };
})(PromiseSelector.default);

export default CameraBinSelector;