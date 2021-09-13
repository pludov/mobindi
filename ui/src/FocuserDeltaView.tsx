import * as React from 'react';

import * as BackOfficeAPI from '@bo/BackOfficeAPI';
import CancellationToken from 'cancellationtoken';
import Log from './shared/Log';
import * as FocuserDelta from './shared/FocuserDelta';
import * as Utils from './Utils';
import * as BackendRequest from "./BackendRequest";
import * as Store from "./Store";

import './FocuserDeltaView.css'
import * as ImagingSetupStore from './ImagingSetupStore';

const logger = Log.logger(__filename);

type InputProps = {
    imagingSetup: string | null;
}

type MappedProps = {
    valid: boolean;
    warning: string | null;
    same: boolean;
    delta: number | undefined;
    deltaWeight: number | undefined;
}

type Props = InputProps & MappedProps;

type State = {
    runningPromise: number;
}

class FocuserDeltaView extends React.PureComponent<Props, State> {

    constructor(props: Props) {
        super(props);
        this.state = { runningPromise : 0 };
    }

    private readonly move = async () => {
        if (this.props.imagingSetup === null) {
            throw new Error("Invalid imagingSetup");
        }
        return await BackendRequest.RootInvoker("focuser")("adjust")(
            CancellationToken.CONTINUE,
            {
                imagingSetupUuid: this.props.imagingSetup
            }
        );
    }

    private readonly sync = async ()=> {
        if (this.props.imagingSetup === null) {
            throw new Error("Invalid imagingSetup");
        }
        return await BackendRequest.RootInvoker("focuser")("sync")(
            CancellationToken.CONTINUE,
            {
                imagingSetupUuid: this.props.imagingSetup
            }
        );
    }

    private readonly clicked=(what: string)=>{
        if (what === "move") {
            Utils.promiseToState(this.move, this);
        }

        if (what === "sync") {
            Utils.promiseToState(this.sync, this);
        }
    }

    render() {
        if (!this.props.valid) {
            return null;
        }

        let deltaWeightClass: string = "";
        if (this.props.deltaWeight !== undefined) {
            if (this.props.deltaWeight <= 0.5) {
                deltaWeightClass = "FocuserDeltaGood";
            } else if (this.props.deltaWeight < 1) {
                deltaWeightClass = "FocuserDeltaAverage";
            } else {
                deltaWeightClass = "FocuserDeltaBad";
            }
        }
        return <>
            {this.props.warning
                ?
                    <span className={"Notification_Inline Notification_Warning"}>⚠</span>
                :
                    null
            }
            <select value="" onChange={(e)=>this.clicked(e.target.value)}
                        className={(this.state.runningPromise ? " BusyInfinite ": "") + deltaWeightClass }>
                    <option value="" hidden={true}>{this.props.delta !== undefined ? "Δ"+this.props.delta : "N/A"}</option>
                    <option disabled={this.props.delta === undefined || this.props.delta === 0} value="move">Adjust</option>
                    <option disabled={this.props.delta === 0} value="sync">Sync</option>
                </select>
        </>;
    }

    static mapStateToProps(store:Store.Content, ownProps: InputProps):MappedProps {
        const imagingSetup = ImagingSetupStore.getImagingSetup(store, ownProps.imagingSetup);
        if (imagingSetup === null) {
            return {
                valid: false,
                warning: null,
                same: false,
                delta: undefined,
                deltaWeight: undefined,
            }
        }
        const focuserSettings = imagingSetup.focuserSettings;
        let delta;
        let warning:string = "";
        try {
            delta = FocuserDelta.getFocusDelta(imagingSetup.dynState, focuserSettings.focusStepPerDegree, focuserSettings.focusStepTolerance, focuserSettings.focuserFilterAdjustment, focuserSettings.temperatureProperty);
        } catch(e) {
            warning = e.message;
            delta = null;
        }

        return {
            valid: true,
            warning: warning || imagingSetup.dynState.temperatureWarning ||
                imagingSetup.dynState.filterWheelWarning ||
                imagingSetup.dynState.focuserWarning,
            delta: delta?.fromCur,
            deltaWeight: delta?.fromCurWeight,
            same:
                imagingSetup.dynState.curFocus?.temp === imagingSetup.dynState.refFocus?.temp &&
                imagingSetup.dynState.curFocus?.filter === imagingSetup.dynState.refFocus?.filter &&
                imagingSetup.dynState.curFocus?.position === imagingSetup.dynState.refFocus?.position
        }
    }
}

export default Store.Connect(FocuserDeltaView);
