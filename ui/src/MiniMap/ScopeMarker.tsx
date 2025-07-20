import { deepEqual } from '../shared/Obj';
import React from 'react';
import * as Store from "../Store";
import * as IndiStore from "../IndiStore";
import SkyProjection from '../SkyAlgorithms/SkyProjection';
import * as PolarAlignment from '../SkyAlgorithms/PolarAlignment';
import * as IndiUtils from '../IndiUtils';
import { defaultMemoize } from 'reselect';
import ScopeJoystick from '../ScopeJoystick';
import { PolarAlignSettings, PolarAlignStatus } from '@bo/BackOfficeStatus';
import Marker from './Marker';

type InputProps = {
    className?: string;
    style?: React.CSSProperties;
    device: string;
};
type MappedProps = {
    alt?: number;
    az?: number;
}

type Props = InputProps & MappedProps;

class ScopeMarker extends React.PureComponent<Props> {

    static getScopeAltAz(store: Store.Content, currentScope: string, now: number) {
        const geoCoords = IndiStore.getMountGeoCoords(store, currentScope);

        if (!geoCoords) {
            return undefined;
        }
        // FIXME: share with MountStore
        const raDecScope = IndiStore.getMountPos(store, currentScope);
        if (!raDecScope) {
            return undefined;
        }

        const zenithRa = SkyProjection.getLocalSideralTime(now, geoCoords.long);
        const scopeAltAz = SkyProjection.lstRelRaDecToAltAz({relRaDeg: 15 * raDecScope.ra - zenithRa, dec: raDecScope.dec}, geoCoords);

        scopeAltAz.alt = Math.round(scopeAltAz.alt);
        scopeAltAz.az = Math.round(scopeAltAz.az);
        return scopeAltAz;
    }

    static roundScopeAltAz(input: { alt:number, az:number}|undefined) {
        if (!input) return undefined;
        let scopeAltAz = {...input};
        scopeAltAz.alt = Math.round(scopeAltAz.alt);
        scopeAltAz.az = Math.round(scopeAltAz.az);
        return scopeAltAz;
    }

    constructor(props:Props) {
        super(props);
    }

    render() {
        if (this.props.alt === undefined || this.props.az === undefined) {
            return null;
        }
        return (<>
            <Marker
                className={this.props.className}
                style={this.props.style}
                alt={this.props.alt}
                az={this.props.az}
            />
        </>);
    }

    static mapStateToProps(store: Store.Content, props: InputProps):MappedProps {
        const now = new Date().getTime();
        let mountAltAz = IndiStore.getMountAltAz(store, props.device, now);

        return {...mountAltAz}
    }
}

export default Store.Connect(ScopeMarker);


