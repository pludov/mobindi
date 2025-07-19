import React from 'react';
import CancellationToken from 'cancellationtoken';
import Log from './shared/Log';
import * as Store from './Store';
import * as IndiStore from "./IndiStore";
import * as IndiManagerStore from './IndiManagerStore';
import "./MountTrackButton.css";
const logger = Log.logger(__filename);

type Status = "idle" | "tracking";

type InputProps = {
    scope: string | null |undefined;
}

type MappedProps = {
    status?: Status;
}

type Props = InputProps & MappedProps;

type State = {
    busy?: boolean;
}

class MountTrackButton extends React.PureComponent<Props, State> {
    constructor(props:Props) {
        super(props);
        this.state = {
            busy: false
        };
    }

    private onClick = async ()=> {
        const scope = this.props.scope;
        if (!scope) {
            logger.warn("No scope connected, cannot park/unpark");
            return;
        }
        if (this.state.busy) {
            logger.warn("Already busy, cannot park/unpark");
            return;
        }
        this.setState({busy: true});

        try {
            switch(this.props.status) {
                case "idle":
                    logger.info("Activating mount tracking");
                    await IndiStore.updateVectorProp(scope, "TELESCOPE_TRACK_STATE", "TRACK_ON", "On");
                    break;
                case "tracking":
                    logger.info("Deactivating mount tracking");
                    IndiStore.updateVectorProp(scope, "TELESCOPE_TRACK_STATE", "TRACK_OFF", "On");
                    break;
            }
        } catch (e) {
            logger.error("Error while switching tracking on mount", e);
        } finally {
            this.setState({busy: false});
        }
    }

    render() {
        const disabled = this.state.busy 
                || !this.props.scope;
        const title = this.props.status === "tracking" ? "⏸" : "▶";
        return (
            <input className={`GlyphBton TrackButton ${this.props.status || ''}`}
                    type="button" 
                    value={title} 
                    onClick={this.onClick}
                    disabled={disabled} />
        );
    }

    static mapStateToProps(store: Store.Content, ownProps: InputProps):MappedProps {
        // Locate the TELESCOPE_PARK vector
        // {"dev":"Scope","vec":"TELESCOPE_PARK","children":[{"name":"PARK","value":"On"}]}}
        const vec = (typeof ownProps.scope === "string")
          ? IndiManagerStore.getVector(store, ownProps.scope, "TELESCOPE_TRACK_STATE")
          : null;

        if (vec === null) {
            return {};
        }

        let is_tracking = !!(vec.childs["TRACK_ON"]?.$_ === "On");
        let is_idle = !!(vec.childs["TRACK_OFF"]?.$_ === "On");

        if (is_tracking) {
            return {status: "tracking"};
        } else if (is_idle) {
            return {status: "idle"};
        } else {
            logger.warn("Unknown tracking state for mount", vec);
            return {};
        }
    }
}

export default Store.Connect(MountTrackButton);

