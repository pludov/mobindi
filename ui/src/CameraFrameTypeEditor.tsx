import React, { Component, PureComponent} from 'react';
import * as Help from './Help';
import * as Utils from './Utils';
import * as IndiSelectorEditor from './IndiSelectorEditor';

type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>

type InputProps = Omit<IndiSelectorEditor.InputProps, "vecName"|"helpKey">;

const cameraFrameTypeEditorHelp = Help.key("frame type", "Choose the frame type. Mobindi uses that for naming of files and statistics. This is also recorded in FITS files. It may have additional effect for the camera driver.");

const defaultTitles = {
    "FRAME_LIGHT": "Light",
    "FRAME_BIAS": "Bias",
    "FRAME_DARK": "Dark",
    "FRAME_FLAT": "Flat"
}

function defaultFrameTypeTitle(id:string) {
    return Utils.getOwnProp(defaultTitles, id);
}

export default function(ownProps:InputProps) {
    return <IndiSelectorEditor.default defaultTitleProvider={defaultFrameTypeTitle} {...ownProps} helpKey={cameraFrameTypeEditorHelp} vecName="CCD_FRAME_TYPE"/>
}
