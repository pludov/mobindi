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

const StatusForGuiding = ["Paused", "Looping", "Stopped", "LostLock" ];


type InputProps = {}
type MappedProps = {
    SNR: PhdStar["SNR"]|null;
    AppState: PhdStatus["AppState"]|null;
}
type Props = InputProps & MappedProps;

// Avoid loosing zoom
type State = {
    track?: boolean;
    min?: number;
    max?: number;
    width?: number;
}

// Afficher l'état de phd et permet de le controller
class PhdView extends React.PureComponent<Props, State> {
    pendingTimeout: NodeJS.Timeout|null;

    constructor(props:Props) {
        super(props);
        this.state = {}
        this.pendingTimeout = null;
    }

    private startGuide = async ()=> {
        await BackendRequest.RootInvoker("phd")("startGuide")(CancellationToken.CONTINUE, {});
    }

    private stopGuide = async ()=>{
        await BackendRequest.RootInvoker("phd")("stopGuide")(CancellationToken.CONTINUE, {});
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
                <PhdGraph/>
                <PhdStats/>
                <div className="ButtonBar">
                <input type="button" value="Guide" onClick={this.startGuide}
                    disabled={StatusForGuiding.indexOf(this.props.AppState) == -1}
                    />
                <input type="button" value="Stop" onClick={this.stopGuide}
                    disabled={this.props.AppState == "Stopped"}
                    />
                <PhdExposureSelector/>
                </div>
            </div>);
    }

    static mapStateToProps = (store:Store.Content, ownProps: InputProps):MappedProps=>{
        const phd = store.backend.phd;
        if (!phd) {
            return {
                SNR: null,
                AppState: null,
            };
        }
        return {
            SNR: phd.star ? phd.star.SNR : null,
            AppState: phd.AppState,
        }
    }
}


export default Store.Connect(PhdView);