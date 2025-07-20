import { deepEqual } from '../shared/Obj';
import React from 'react';
import * as Store from "../Store";
import SkyProjection from '../SkyAlgorithms/SkyProjection';
import * as PolarAlignment from '../SkyAlgorithms/PolarAlignment';
import * as IndiUtils from '../IndiUtils';
import { defaultMemoize } from 'reselect';
import ScopeJoystick from '../ScopeJoystick';
import { PolarAlignSettings, PolarAlignStatus } from '@bo/BackOfficeStatus';

import "./MiniMap.css";

type InputProps = {
    className?: string;
};
type MappedProps = {
}
type Props = InputProps & MappedProps;


class MiniMap extends React.PureComponent<Props> {


    constructor(props:Props) {
        super(props);
    }

    render() {
        return (<div className={`MiniMapContainer ${this.props.className || ''}`}>
            {this.props.children}
        </div>);
    }

    static mapStateToProps(store: Store.Content, props: InputProps):MappedProps {
        return {}
    }
}

export default Store.Connect(MiniMap);