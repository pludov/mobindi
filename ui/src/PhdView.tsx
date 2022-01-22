/**
 * Created by ludovic on 18/07/17.
 */
import * as React from 'react';


import * as Store from "./Store";
import * as BackendRequest from "./BackendRequest";
import './PhdView.css';
import { PhdStatus, PhdStar } from '@bo/BackOfficeStatus';
import CancellationToken from 'cancellationtoken';
import PhdExposureSelector from './PhdExposureSelector';
import PhdGraph from './PhdGraph';
import PhdStats from './PhdStats';
import PhdStream from './PhdStream';
import * as GenericUiStore from './GenericUiStore';
import * as Help from './Help';

const StatusForGuiding = ["Paused", "Looping", "LostLock" ];
const StatusForLooping = ["Guiding", "Paused", "Stopped", "LostLock" ];
const StatusForClearingCalibration = ["Paused", "Stopped", "Looping" ];

type ViewId = "graph"|"image";

type InputProps = {}
type MappedProps = {
    SNR: PhdStar["SNR"]|null;
    AppState: PhdStatus["AppState"]|null;
    streamingCamera: PhdStatus["streamingCamera"]|null;
    calibrated: boolean;
}
type Props = InputProps & MappedProps;

// Avoid loosing zoom
type State = {
    view: ViewId;
}

const viewIdStateLocalStorageKey = "phdview.view";

const startLoopingHelp = Help.key("Start PHD looping", "PHD guiding will start taking exposure. If guide camera is an INDI device, the live view is available using the bottom right selector");
const startGuideHelp = Help.key("Start PHD guiding", "PHD will start guiding, selecting a star if none is available");
const stopGuideHelp = Help.key("Stop PHD guide & looping");
const clearCalibrationHelp = Help.key("Clear calibration", "Clearing calibration causes PHD2 to recalibrate next time guiding starts.");
const chooseViewHelp = Help.key("Toggle between PHD guiding graph and PHD live frame view (only available when PHD is using INDI driver)");

// Afficher l'état de phd et permet de le controller
class PhdView extends React.PureComponent<Props, State> {
    constructor(props:Props) {
        super(props);
        this.state = {
            view:  GenericUiStore.initComponentState<ViewId>(
                            viewIdStateLocalStorageKey,
                            (t:ViewId|undefined)=> (t !== "image" ? "graph" : "image")
            ),
        }
    }

    private startGuide = async ()=> {
        await BackendRequest.RootInvoker("phd")("startGuide")(CancellationToken.CONTINUE, {});
    }

    private startLoop = async ()=> {
        await BackendRequest.RootInvoker("phd")("startLoop")(CancellationToken.CONTINUE, {});
    }

    private stopGuide = async ()=>{
        await BackendRequest.RootInvoker("phd")("stopGuide")(CancellationToken.CONTINUE, {});
    }

    private clearCalibration = async ()=> {
        await BackendRequest.RootInvoker("phd")("clearCalibration")(CancellationToken.CONTINUE, {});
    }

    private setView = (e:React.ChangeEvent<HTMLSelectElement>)=> {
        const view = e.target.value as ViewId;
        GenericUiStore.updateComponentState<ViewId>(viewIdStateLocalStorageKey, view);
        this.setState({view});
    }

    render() {
        if (this.props.AppState === null) {
            return null;
        }
        return (
            <div className="Page">
                <div className={'PHDAppState PHDAppState_' + this.props.AppState}>{this.props.AppState}
                </div>
                <div>SNR: {this.props.SNR}
                </div>
                {this.state.view === "graph"
                    ?
                        <>
                            <PhdGraph/>
                            <PhdStats/>
                        </>
                    :
                        <>
                            <PhdStream/>
                        </>
                }
                <div className="ButtonBar">
                <input type="button" value={"\u21BB"} onClick={this.startLoop}
                    {...startLoopingHelp.dom()}
                    disabled={StatusForLooping.indexOf(this.props.AppState) == -1}
                    className="PhdControlBton"
                    />
                <input type="button" value='❌' className="PhdControlBton" onClick={this.clearCalibration}
                    {...clearCalibrationHelp.dom()}
                    disabled={(!this.props.calibrated) || StatusForClearingCalibration.indexOf(this.props.AppState) === -1}
                    />
                <input type="button" value={"\u{2295}"} onClick={this.startGuide}
                    {...startGuideHelp.dom()}
                    disabled={StatusForGuiding.indexOf(this.props.AppState) == -1}
                    className="PhdControlBton"
                    />
                <input type="button" value={"\u{1F6D1}"} onClick={this.stopGuide}
                    {...stopGuideHelp.dom()}
                    disabled={this.props.AppState === "Stopped" || this.props.AppState === "NotConnected"}
                    className="PhdControlBton"
                    />
                <PhdExposureSelector/>
                <div className="PhdViewChoose">
                    <select value={this.state.view} onChange={this.setView} {...chooseViewHelp.dom()}>
                        <option value="graph">Graph</option>
                        <option value="image" disabled={!this.props.streamingCamera}>Live</option>
                    </select>
                </div>
                </div>
            </div>);
    }

    static mapStateToProps = (store:Store.Content, ownProps: InputProps):MappedProps=>{
        const phd = store.backend.phd;
        if (!phd) {
            return {
                SNR: null,
                AppState: null,
                streamingCamera: null,
                calibrated: false,
            };
        }
        return {
            SNR: phd.star ? phd.star.SNR : null,
            AppState: phd.AppState,
            calibrated: !!(phd.calibration?.calibrated),
            streamingCamera: phd.streamingCamera,
        }
    }
}


export default Store.Connect(PhdView);