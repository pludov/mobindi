import React from 'react';
import '../../AstrometryView.css';
import * as Store from "../../Store";
import * as Help from "../../Help";
import * as AccessPath from '../../shared/AccessPath';
import Panel from "../../Panel";
import Int from '../../primitives/Int';
import Float from '../../primitives/Float';
import IndiSelectorEditor from '../../IndiSelectorEditor';
import * as AstrometryStore from "../../AstrometryStore";
import { RecursiveBackendAccessor } from "../../utils/BackendAccessor";
import { MeridianFlipSettings, PolarAlignSettings } from '@bo/BackOfficeStatus';
import ImageControl from '../ImageControl';

type InputProps = {};
type MappedProps = {
    currentScope: string;
}
type Props = InputProps & MappedProps;

class InitialConfirm extends React.PureComponent<Props> {
    static sampleCountHelp = Help.key("Number of samples", "Enter the number of exposure to take. Exposure will be spaced evenly between min and max angles.");
    static angleHelp = Help.key("Max angle", "Maximum RA angle from meridian (°). The mount will move in the same side of pier from the meridian up to this angle (mount limit)");
    static minAltitudeHelp = Help.key("Minimum altitude", "Ensure exposure below are not taken at altitude below that angle (°).");
    static slewRateHelp = Help.key("Slew rate", "Choose slew rate for the mount moves. Refer to the INDI driver of the mount for actual meaning.");
    accessor: RecursiveBackendAccessor<MeridianFlipSettings>;
    
    constructor(props:Props) {
        super(props);
        this.accessor = AstrometryStore.astrometrySettingsAccessor().child(AccessPath.For((e)=>e.meridianFlip));
    }

    render() {
        return <>
            <div className="PolarAlignExplain">
            Blah blah
            </div>

            <ImageControl imagingSetupIdAccessor={AstrometryStore.currentImagingSetupAccessor()}/>

            <Panel guid="astrom:meridianFlip:iteration">
                <span>TODO</span>
                <div>
                    TODO:
                </div>
            </Panel>
        </>
    }

    static mapStateToProps(store: Store.Content, props: InputProps):MappedProps {
        return {
            currentScope: store.backend.astrometry?.selectedScope || "",
        }
    }
}

export default Store.Connect(InitialConfirm);