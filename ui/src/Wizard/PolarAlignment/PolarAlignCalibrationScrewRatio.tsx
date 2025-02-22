import React from 'react';
import '../../AstrometryView.css';
import * as Store from "../../Store";
import * as AstrometryStore from "../../AstrometryStore";
import * as AccessPath from '../../shared/AccessPath';
import * as BackendAccessor from "../../utils/BackendAccessor";
import { PolarAlignSettings, PolarAlignStatus, PolarAlignPositionMessage, PolarAlignAxisSettings } from '@bo/BackOfficeStatus';

type InputProps = {
    axis: "az"|"alt";
};

type MappedProps = {
    // Degree per turn
    currentRatio: number|null;
    axisNames: [string, string];
}


type Props = InputProps & MappedProps;

class PolarAlignCalibrationScrewRatio extends React.PureComponent<Props> {
    accessor: BackendAccessor.RecursiveBackendAccessor<PolarAlignSettings>;
    
    constructor(props:Props) {
        super(props);
        this.accessor = AstrometryStore.astrometrySettingsAccessor().child(AccessPath.For((e)=>e.polarAlign));
    }
    
    render() {
        if (this.props.currentRatio === null) {
            return <i>Not yet set...</i>;
        }
        return <>{this.props.currentRatio.toFixed(2)}° in {this.props.axis} per {this.props.axisNames[0]} screw turn</>;
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

export default Store.Connect(PolarAlignCalibrationScrewRatio);