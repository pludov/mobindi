import CancellationToken from 'cancellationtoken';
import * as React from 'react';
import { connect } from 'react-redux';
import * as BackendRequest from "./BackendRequest";
import * as Help from './Help';
import { atPath } from './shared/JsonPath';
import * as PromiseSelector from './PromiseSelector';
import * as Utils from './Utils';
import * as Store from './Store';
import * as IndiUtils from './IndiUtils';
import { updateVectorProp } from './IndiStore';
import "./CameraTempSelector.css";

type InputProps = {
    // name of the device (indi id)
    device: string|undefined;

    live: boolean;
    // Location of the value in the store
    valuePath: string;
    // Function that build a promises
    setValue: (e:number|null)=>Promise<void>;
    focusRef?: React.RefObject<HTMLSelectElement>;
}

type MappedProps = PromiseSelector.Props<number|null>;

type Props = InputProps & MappedProps;

function CCDTempValueGenerator(props: Props) {
    const result: Array<number|"off"> = [];
    for(let i = 30; i >= -30; --i) {
        result.push(i);
    }

    result.push("off");
    return result;
}

function CCDTempTitle(x: number|"off"|undefined) {
    return x === "off" ? '🌡 off' : x + '°C';
}


function getTempId(x: number|"off") {
    return "" + x;
}

const CameraCCDTempEditor = connect((store: Store.Content, ownProps: InputProps) => {
    const coolerVec = ownProps.device === undefined ? undefined : IndiUtils.getVectorDesc(store, ownProps.device, 'CCD_COOLER');
    const tempVec = ownProps.device === undefined ? undefined : IndiUtils.getVectorDesc(store, ownProps.device, 'CCD_TEMPERATURE');
    let active: number|"off";

    let doSetValue : (v: number|null) => Promise<void>;

    if (ownProps.live) {
        if (coolerVec?.childs.COOLER_ON?.$_ === 'On') {
            active = parseFloat(tempVec?.childs.CCD_TEMPERATURE_VALUE?.$_ || "");
            if (isNaN(active)) {
                active = "off";
            }
        } else {
            active = "off";
        }
        doSetValue = async (v)=> {
            if (ownProps.device === undefined) {
                throw new Error("invalid device");
            }

            await BackendRequest.RootInvoker("camera")("setCcdTempTarget")(
                CancellationToken.CONTINUE,
                {
                    deviceId: ownProps.device,
                    targetCcdTemp: v
                }
            );
        }
    } else {
        active = atPath(store, ownProps.valuePath);
        if (active === null) {
            active = "off";
        }
        doSetValue = ownProps.setValue;
    }

    return ({
        activeNumber: active,
        getId: getTempId,
        availablesGenerator: CCDTempValueGenerator,
        getTitle: CCDTempTitle,
        setValue: async (v: string) => {
            if (v === 'off') {
                return await doSetValue(null);
            } else {
                return await doSetValue(parseFloat(v));
            }
        },
        className: "CameraTempSelector"

    } as Partial<MappedProps>);
})(PromiseSelector.default) as new (props:InputProps)=>(React.PureComponent<InputProps>);


export default CameraCCDTempEditor;