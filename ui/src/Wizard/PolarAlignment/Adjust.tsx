import React from 'react';
import '../../AstrometryView.css';
import * as Store from "../../Store";
import * as AstrometryStore from "../../AstrometryStore";
import * as AccessPath from '../../shared/AccessPath';
import * as DegreeDistanceDisplay from '../../utils/DegreeDistanceDisplay';
import * as BackendAccessor from "../../utils/BackendAccessor";
import { PolarAlignSettings, PolarAlignStatus, PolarAlignPositionMessage } from '@bo/BackOfficeStatus';
import StatusLabel from '../../Sequence/StatusLabel';
import ImageControl from '../ImageControl';
import ScopeJoystick from '../../ScopeJoystick';

type InputProps = {};
type MappedProps = {
    canTakeMoveFrame: boolean;
    canChangeFrameType: boolean;
    tooEast: number|null;
    tooHigh: number|null;
    distance: number|null;
    adjusting: PolarAlignStatus["adjusting"];
    adjustError: PolarAlignStatus["adjustError"];
    nextFrame: PolarAlignStatus["adjusting"];

    adjustPositionMessage: null|string;
    adjustPositionWarning: null|string;
    adjustPositionError: PolarAlignStatus["adjustPositionError"];
    imagingSetup: string|null;
}

type Props = InputProps & MappedProps;

class Adjust extends React.PureComponent<Props> {
    accessor: BackendAccessor.RecursiveBackendAccessor<PolarAlignSettings>;
    
    constructor(props:Props) {
        super(props);
        this.accessor = AstrometryStore.astrometrySettingsAccessor().child(AccessPath.For((e)=>e.polarAlign));
    }

    setNextFrame = (e:React.ChangeEvent<HTMLSelectElement>)=> {
        this.accessor.child(AccessPath.For((e)=>e.dyn_nextFrameIsReferenceFrame)).send(e.target.value === "refframe");
    }

    render() {
        
        return <>
            <div className="Wizard_subtitle">
                Adjusting the mount axe
            </div>
            <div className="PolarAlignDeltaDisplay">
                <div>
                    Δ toward east: {this.props.tooEast === null ? "N/A" : DegreeDistanceDisplay.deltaTitle(this.props.tooEast)}
                </div>
                <div>
                    Δ toward zenith: {this.props.tooHigh === null ? "N/A" : DegreeDistanceDisplay.deltaTitle(this.props.tooHigh)}
                </div>
            </div>
            {this.props.adjustPositionError !== null
                    ? <div className="PolarAlignExplainError">{this.props.adjustPositionError}</div>
                    : null
            }
            {this.props.adjustPositionWarning !== null
                ? <div className="PolarAlignExplainBigWarning">
                        {this.props.adjustPositionWarning}
                        <br/>
                        Please slew somewhere else then take a new reference frame.
                    </div>
                :null
            }
            {this.props.adjustPositionMessage !== null
                ? <div className="PolarAlignExplainGood">
                    {this.props.adjustPositionMessage}
                </div>
                : null
            }
            <div>
                {!!this.props.adjusting
                    ?
                        <div className={"PolarAlignStatus "
                                    + (this.props.adjustError === null ? "PolarAlignStatus_running" : "PolarAlignStatus_error")}>
                            <StatusLabel
                                className={this.props.adjustError === null ? "PolarAlignStatus_running" : "PolarAlignStatus_error"}
                                text={this.props.adjustError === null
                                        ? "Taking " + (this.props.adjusting === "frame" ? " adjustment frame" : " reference frame")
                                        : this.props.adjustError}
                            />
                        </div>
                    :
                        <div>
                            Next frame: {this.props.canTakeMoveFrame
                                    ? <select value={this.props.nextFrame!} onChange={this.setNextFrame}>
                                        <option value="frame">Adjustment</option>
                                        <option value="refframe">Reference</option>
                                    </select>

                                    :   <b>Reference (required)</b>
                                }
                        </div>
                }
                {this.props.nextFrame === "refframe"
                    ? <>
                        <div className="PolarAlignExplain">
                            Click next to take a ref frame.<br/>
                            You can move (slew) the scope to a region with more stars if required.<br/>
                            If you just moved the polar axis of the mount, ensure that an adjustment frame has been completed before slewing the scope.
                        </div>
                        {this.props.imagingSetup !== null
                            ? <div className="ScopeJoystickContainer">
                                <ScopeJoystick imagingSetup={this.props.imagingSetup}/>
                            </div>
                            : null
                        }
                    </>
                    : null
                }
                {this.props.nextFrame === "frame"
                    ? <div className="PolarAlignExplain">
                        Move the polar axis of your mount in Alt and Az (no slew) to correct the deltas.
                    </div>
                    : null
                }
            </div>


            <span style={{visibility: !!this.props.adjusting ? "hidden" : "unset"}}>
                <ImageControl imagingSetupIdAccessor={AstrometryStore.currentImagingSetupAccessor()}/>
            </span>
        </>
    }

    static mapStateToProps(store: Store.Content, props: InputProps):MappedProps {

        let imagingSetup = AstrometryStore.currentImagingSetupAccessor().fromStore(store);

        const status = store.backend.astrometry?.runningWizard?.polarAlignment;
        if (status === undefined) {
            return {
                canTakeMoveFrame: false,
                canChangeFrameType: false,
                tooEast: null,
                tooHigh: null,
                distance: null,
                adjustError: null,
                adjusting: null,
                nextFrame: null,
                adjustPositionMessage: null,
                adjustPositionWarning: null,
                adjustPositionError: null,
                imagingSetup,
            };
        }
        let nextFrame : MappedProps["nextFrame"];
        if (status.adjusting) {
            nextFrame = null;
        } else {
            if (!status.hasRefFrame) {
                nextFrame = "refframe";
            } else {
                nextFrame = store.backend.astrometry?.settings.polarAlign.dyn_nextFrameIsReferenceFrame ? "refframe" : "frame";
            }
        }
        return {
            canTakeMoveFrame: !!status.hasRefFrame,
            canChangeFrameType: (!status.shootRunning) && (!status.astrometryRunning),
            tooEast: status.axis ? status.axis!.tooEast : null,
            tooHigh: status.axis ? status.axis!.tooHigh : null,
            distance: status.axis ? status.axis!.distance : null,
            adjusting: status.adjusting,
            adjustError: status.adjustError,
            nextFrame,
            adjustPositionMessage: (status.adjustPositionMessage?.warning === false) ? status.adjustPositionMessage.message : null,
            adjustPositionWarning: (status.adjustPositionMessage?.warning) ? status.adjustPositionMessage.message : null,
            adjustPositionError: status.adjustPositionError,
            imagingSetup,
        };
    }
}

export default Store.Connect(Adjust);