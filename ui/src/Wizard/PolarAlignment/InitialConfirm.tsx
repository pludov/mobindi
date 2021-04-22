import React from 'react';
import '../../AstrometryView.css';
import * as Store from "../../Store";
import * as Help from "../../Help";
import * as AccessPath from '../../utils/AccessPath';
import Panel from "../../Panel";
import Int from '../../primitives/Int';
import Float from '../../primitives/Float';
import IndiSelectorEditor from '../../IndiSelectorEditor';
import * as AstrometryStore from "../../AstrometryStore";
import { RecursiveBackendAccessor } from "../../utils/BackendAccessor";
import { PolarAlignSettings } from '@bo/BackOfficeStatus';
import ImageControl from './ImageControl';

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
    accessor: RecursiveBackendAccessor<PolarAlignSettings>;
    
    constructor(props:Props) {
        super(props);
        this.accessor = AstrometryStore.astrometrySettingsAccessor().child(AccessPath.For((e)=>e.polarAlign));
    }

    setSlewRate = async (s:string)=> {
        this.accessor.child(AccessPath.For((e)=>e.slewRate)).send(s);
    }

    render() {
        return <>
            <div className="PolarAlignExplain">
            This wizard will move the scope in RA and measure misalignment of the polar axis.<br/>
            Please point the scope to the place of the sky where you’ll take image, then click next to proceed.
            </div>

            <ImageControl imagingSetupIdAccessor={AstrometryStore.currentImagingSetupAccessor()}/>

            <Panel guid="astrom:polaralign:movements">
                <span>Scope moves</span>
                <div>
                    Max angle from meridian (°):
                    <Float accessor={this.accessor.child(AccessPath.For((e)=>e.angle))} min={0} max={120} helpKey={InitialConfirm.angleHelp}/>
                </div>
                <div>
                    Min alt. above horizon (°):
                    <Float accessor={this.accessor.child(AccessPath.For((e)=>e.minAltitude))} min={0} max={90} helpKey={InitialConfirm.minAltitudeHelp}/>
                </div>
                <div>
                    Number of samples:
                    <Int accessor={this.accessor.child(AccessPath.For((e)=>e.sampleCount))} min={3} max={99} helpKey={InitialConfirm.sampleCountHelp}/>
                </div>
                <div>
                    Slew rate:
                    <IndiSelectorEditor
                        device={this.props.currentScope}
                        // FIXME: use accessor here
                        valuePath="$.backend.astrometry.settings.polarAlign.slewRate"
                        setValue={this.setSlewRate}
                        vecName="TELESCOPE_SLEW_RATE"
                        helpKey={InitialConfirm.slewRateHelp}
                        />
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