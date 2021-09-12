import * as React from 'react';

import * as BackOfficeAPI from '@bo/BackOfficeAPI';
import CancellationToken from 'cancellationtoken';
import Log from './shared/Log';
import * as FocuserStore from "./FocuserStore";
import * as BackendRequest from "./BackendRequest";
import * as Store from "./Store";

import './CameraView.css'
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
}

type Props = InputProps & MappedProps;

class FocuserDeltaView extends React.PureComponent<Props> {

    constructor(props: Props) {
        super(props);
    }

    clicked=(what: string)=>{

    }

    render() {
        if (!this.props.valid) {
            return null;
        }
        if (this.props.warning) {
            return <span>{this.props.warning}</span>
        } else {
            return <select value="" onChange={(e)=>this.clicked(e.target.value)}>
                    <option value="" hidden={true}>{"Δ"+this.props.delta}</option>
                    {this.props.delta !== undefined && this.props.delta != 0
                        ?
                            <>
                                <option value="Move">Move</option>
                                <option value="Sync">Sync</option>
                            </>
                        :
                            null
                    }
                </select>
        }
    }

    static mapStateToProps(store:Store.Content, ownProps: InputProps):MappedProps {
        const imagingSetup = ImagingSetupStore.getImagingSetup(store, ownProps.imagingSetup);
        if (imagingSetup === null) {
            return {
                valid: false,
                warning: null,
                same: false,
                delta: undefined,
            }
        }
        const focuserSettings = imagingSetup.focuserSettings;
        let delta;
        let warning:string = "";
        try {
            delta = FocuserStore.getFocusDelta(imagingSetup.dynState, focuserSettings.focusStepPerDegree, focuserSettings.focuserFilterAdjustment, focuserSettings.temperatureProperty);
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
            same:
                imagingSetup.dynState.curFocus?.temp === imagingSetup.dynState.refFocus?.temp &&
                imagingSetup.dynState.curFocus?.filter === imagingSetup.dynState.refFocus?.filter &&
                imagingSetup.dynState.curFocus?.position === imagingSetup.dynState.refFocus?.position
        }
    }
}

export default Store.Connect(FocuserDeltaView);
