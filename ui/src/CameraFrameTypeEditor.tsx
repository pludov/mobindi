import React, { Component, PureComponent} from 'react';
import * as IndiSelectorEditor from './IndiSelectorEditor';

type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>

type InputProps = Omit<IndiSelectorEditor.InputProps, "vecName">;

export default function(ownProps:InputProps) {
    return <IndiSelectorEditor.default {...ownProps} vecName="CCD_FRAME_TYPE"/>
}
