import React, { Component, PureComponent} from 'react';
import { connect } from 'react-redux';
import { atPath } from './shared/JsonPath';
import * as PromiseSelector from './PromiseSelector';
import * as Utils from './Utils';
import * as Store from './Store';
import * as IndiUtils from './IndiUtils';
import { IndiDevice } from '@bo/BackOfficeStatus';

type InputProps = {
    // name of the device (indi id)
    device: string;
    // Location of the value in the store
    valuePath: string;
    // Function that build a promises
    setValue: (e:string)=>Promise<void>;
}

type MappedProps = PromiseSelector.Props<string> & {
    indiDeviceDesc: IndiDevice|undefined;
}

type Props = InputProps & MappedProps;

function CameraFrameTypeTitle(x: string, props: Props) {
    return Utils.noErr(()=>props.indiDeviceDesc!.childs[x].$label, x);
}

const CameraFrameTypeSelector = connect((store: Store.Content, ownProps: InputProps) => {
    var indiDeviceDesc = Utils.noErr(()=>IndiUtils.getDeviceDesc(store, ownProps.device)!.CCD_FRAME_TYPE, undefined);
    return ({
        indiDeviceDesc: indiDeviceDesc,
        active: atPath(store, ownProps.valuePath),
        availables: Utils.noErr(()=>(indiDeviceDesc!.childNames), []),
        getTitle: CameraFrameTypeTitle
    });
})(PromiseSelector.default)

export default CameraFrameTypeSelector;