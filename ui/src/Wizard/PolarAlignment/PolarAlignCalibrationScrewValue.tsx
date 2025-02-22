import React from 'react';
import '../../AstrometryView.css';
import * as Store from "../../Store";
import * as AstrometryStore from "../../AstrometryStore";
import * as AccessPath from '../../shared/AccessPath';
import * as DegreeDistanceDisplay from '../../utils/DegreeDistanceDisplay';
import * as BackendAccessor from "../../utils/BackendAccessor";
import { PolarAlignSettings, PolarAlignStatus, PolarAlignPositionMessage, PolarAlignAxisSettings } from '@bo/BackOfficeStatus';
import StatusLabel from '../../Sequence/StatusLabel';
import ImageControl from '../ImageControl';
import ScopeJoystick from '../../ScopeJoystick';
import TextEdit from '../../TextEdit';

type InputProps = {
    axis: "az"|"alt";
    value: number;
};

type MappedProps = {
    // Degree per turn
    currentRatio: number|null;
    axisNames: [string, string];
}


type Props = InputProps & MappedProps;

class PolarAlignCalibrationScrewValue extends React.PureComponent<Props> {
    accessor: BackendAccessor.RecursiveBackendAccessor<PolarAlignSettings>;
    
    constructor(props:Props) {
        super(props);
        this.accessor = AstrometryStore.astrometrySettingsAccessor().child(AccessPath.For((e)=>e.polarAlign));
    }
    
    render() {
        if (this.props.currentRatio === null) {
            return <i>Not calibrated</i>;
        }

        // Get the number of turn
        const rawTurn = this.props.value / this.props.currentRatio;

        const axis = rawTurn >= 0 ? this.props.axisNames[0] : this.props.axisNames[1];

        const turn = Math.floor(Math.abs(rawTurn));

        const degree = Math.floor(360 * (Math.abs(rawTurn) - turn));

        return <>Turn <b>{axis}
                &nbsp;
                { turn !== 0 ?
                    <>{turn} turns +
                    </>
                : null
                } {degree}°</b></>;
    }

    static mapStateToProps(store: Store.Content, props: InputProps):MappedProps {

        const axisId = props.axis;
        const polarAlign = store.backend?.astrometry?.settings?.polarAlign;
        const axis: PolarAlignAxisSettings|null = polarAlign?.[axisId] || null;
        
        return {
            currentRatio : axis?.axisTurnPerMovedDegree || null,
            axisNames : axis? [axis.screwLabelStraight, axis.screwLabelReverse] : ["clockwise", "counter-clockwise"],
        };
    }

};

export default Store.Connect(PolarAlignCalibrationScrewValue);