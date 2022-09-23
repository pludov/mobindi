/**
 * Created by ludovic on 18/07/17.
 */
import * as React from 'react';

import * as Store from "./Store";
import * as Help from "./Help";
import * as BackendRequest from "./BackendRequest";
import './PhdView.css';
import { PhdStatus, CameraStream } from '@bo/BackOfficeStatus';
import FitsViewerInContext from './FitsViewerInContext';
import { hasKey } from './shared/Obj';
import FitsMarker from './FitsViewer/FitsMarker';
import CancellationToken from 'cancellationtoken';
import ContextMenuItem from './FitsViewer/ContextMenuItem';


type InputProps = {}
type MappedProps = {
    AppState?: PhdStatus["AppState"];
    streamingCamera?: PhdStatus["streamingCamera"];
    lockPosition?: PhdStatus["lockPosition"];
    lastLockedPosition?: PhdStatus["lastLockedPosition"];
} & Partial<CameraStream>

type Props = InputProps & MappedProps;

type State = {}


class PhdStream extends React.PureComponent<Props, State> {
    private static selStarHelp = Help.key("Sel. star", "Search star in the selected area (must not be guiding).");
    private static autoFindHelp = Help.key("Auto-find", "Select best guide star over the whole image.");
    private static lockHereHelp = Help.key("Lock here", "Lock the guiding position on the closest star.");

    constructor(props:Props) {
        super(props);
        this.state = {}
    }

    private setLockPos = async (pos: any)=>{
        if (pos.imageX === undefined || pos.imageY === undefined) {
            throw new Error("Position not set");
        }
        await BackendRequest.RootInvoker("phd")("setLockPosition")(CancellationToken.CONTINUE, {x: pos.imageX, y: pos.imageY, exact: false});
    }

    private findStar = async (pos: any) => {
        await BackendRequest.RootInvoker("phd")("findStar")(CancellationToken.CONTINUE, {});
    }

    private findStarHere = async (pos: any) => {
        if (pos.imageX === undefined || pos.imageY === undefined) {
            throw new Error("Position not set");
        }
        await BackendRequest.RootInvoker("phd")("findStar")(CancellationToken.CONTINUE, {
            roi:
                [
                    pos.imageX - 15,
                    pos.imageY - 15,
                    30,
                    30
            ].map(Math.round)
        });
    }

    render() {
        let lockActive =
            this.props.lockPosition && this.props.AppState !== "LostLock"
                ? this.props.lockPosition
                : null;
        let lockLost =
            lockActive ? null : this.props.lastLockedPosition;
        return (
            <div className={"FitsViewer FitsViewContainer"}>
                <FitsViewerInContext
                        contextKey="phdview"
                        path={null}
                        streamId={this.props.streamId || null}
                        streamSerial={this.props.serial === null || this.props.serial === undefined ? null : "" + this.props.serial}
                        subframe={this.props.subframe}
                        streamDetails={this.props.streamDetails || null}>
                    <div className='FitsViewMarkers'>
                        {lockActive
                            ?
                                <FitsMarker x={lockActive.x} y={lockActive.y}>
                                    <div className="PhdStarLock">

                                    </div>
                                </FitsMarker>
                            :
                                null
                        }
                        {lockLost
                            ?
                                <FitsMarker x={lockLost.x} y={lockLost.y}>
                                    <div className="PhdStarLostLock"/>
                                </FitsMarker>
                            :
                                null
                        }
                    </div>


                    <ContextMenuItem
                        title='Sel. star'
                        helpKey={PhdStream.selStarHelp}
                        uid='Phd/0001/sel'
                        cb={this.findStarHere}
                        positional={false}
                        />
                    <ContextMenuItem
                        title='Auto-find'
                        helpKey={PhdStream.autoFindHelp}
                        uid='Phd/0002/find'
                        cb={this.findStar}
                        positional={false}
                        />
                    <ContextMenuItem
                        title='Lock here'
                        helpKey={PhdStream.lockHereHelp}
                        uid='Phd/0003/lock'
                        cb={this.setLockPos}
                        positional={true}
                        />
                </FitsViewerInContext>
        </div>);
    }

    static mapStateToProps = (store:Store.Content, ownProps: InputProps):MappedProps=>{
        const phd = store.backend.phd;
        const cam = store.backend.camera;
        if (phd === undefined || cam === undefined) {
            return {};
        }
        const streamingCamera = phd.streamingCamera;
        if (streamingCamera === null) {
            return {};
        }
        if (!hasKey(cam.currentStreams, streamingCamera)) {
            return {};
        }
        const stream = cam.currentStreams[streamingCamera];
        return {
            streamingCamera,
            lockPosition: phd.lockPosition,
            lastLockedPosition: phd.lastLockedPosition,
            AppState: phd.AppState,
            ...stream
        };
    }
}


export default Store.Connect(PhdStream);