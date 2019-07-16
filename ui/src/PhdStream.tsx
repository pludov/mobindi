/**
 * Created by ludovic on 18/07/17.
 */
import * as React from 'react';

import * as Store from "./Store";
import * as BackendRequest from "./BackendRequest";
import './PhdView.css';
import { PhdStatus, CameraStream } from '@bo/BackOfficeStatus';
import FitsViewerInContext from './FitsViewerInContext';
import { hasKey } from './shared/Obj';


type InputProps = {}
type MappedProps = {
    streamingCamera?: PhdStatus["streamingCamera"]
} & Partial<CameraStream>

type Props = InputProps & MappedProps;

type State = {}


class PhdStream extends React.PureComponent<Props, State> {
    private contextMenu=[];

    constructor(props:Props) {
        super(props);
        this.state = {}
    }

    render() {
        return (
            <div className={"FitsViewer FitsViewContainer"}>
                <FitsViewerInContext
                        contextKey="phdview"
                        contextMenu={this.contextMenu}
                        path={null}
                        streamId={this.props.streamId || null}
                        streamSerial={this.props.serial === null || this.props.serial === undefined ? null : "" + this.props.serial}
                        streamSize={this.props.streamSize || null}/>
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
            ...stream
        };
    }
}


export default Store.Connect(PhdStream);