import React from 'react';
import CancellationToken from 'cancellationtoken';
import Log from './shared/Log';
import * as Store from './Store';
import * as IndiStore from "./IndiStore";
import * as IndiManagerStore from './IndiManagerStore';
import "./MountParkButton.css";
const logger = Log.logger(__filename);

type Status = "parked" | "parking" | "unparked" | "unparking";

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

const titles = {
    "": "N/A",
    parked: "Unpark",
    parking: "Parking...",
    unparked: "Park",
    unparking: "Unparking..."
}

class MountParkButton extends React.PureComponent<Props, State> {
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
                case "parked":
                    logger.info("Unparking mount");
                    await IndiStore.updateVectorProp(scope, "TELESCOPE_PARK", "UNPARK", "On");
                    break;
                case "unparked":
                    logger.info("Parking mount");
                    IndiStore.updateVectorProp(scope, "TELESCOPE_PARK", "PARK", "On");
                    break;
            }
        } catch (e) {
            logger.error("Error while parking/unparking mount", e);
        } finally {
            this.setState({busy: false});
        }
    }

    render() {
        const disabled = this.state.busy 
                || !this.props.scope
                || this.props.status === "parking"
                || this.props.status === "unparking";
        return (
            <input className={`ParkButton ${this.props.status || ''}`}
                    type="button" 
                    value={titles[this.props.status ||""]} 
                    onClick={this.onClick}
                    disabled={disabled} />
        );
    }

    static mapStateToProps(store: Store.Content, ownProps: InputProps):MappedProps {
        // Locate the TELESCOPE_PARK vector
        // {"dev":"Scope","vec":"TELESCOPE_PARK","children":[{"name":"PARK","value":"On"}]}}
        const vec = (typeof ownProps.scope === "string")
          ? IndiManagerStore.getVector(store, ownProps.scope, "TELESCOPE_PARK")
          : null;

        if (vec === null) {
            return {};
        }

        let is_parked = !!(vec.childs["PARK"]?.$_ === "On");
        let is_busy = vec.$state === "Busy";
        if (is_parked) {
            if (is_busy) {
                return {
                    status: "parking"
                };
            } else {
                return {
                    status: "parked"
                };
            }
        } else if (is_busy) {
            return {
                status: "unparking"
            };
        } else { // not parked, not busy
            return {
                status: "unparked"
            };
        }
    }

}

export default Store.Connect(MountParkButton);

