import React from 'react';
import CancellationToken from 'cancellationtoken';
import '../../AstrometryView.css';
import AstrometrySettingsView from '../../AstrometrySettingsView';
import * as Store from '../../Store';
import * as IndiManagerStore from '../../IndiManagerStore';
import * as BackendRequest from "../../BackendRequest";
import { AstrometryWizards } from '@bo/BackOfficeAPI';
import { PolarAlignStatus } from '@bo/BackOfficeStatus';
import InitialConfirm from "./InitialConfirm";
import Progress from "./Progress";

require("chartjs-plugin-zoom");
import * as ReactChartJS from "react-chartjs-2";

type InputProps = {};
type MappedProps = {
    status: PolarAlignStatus["status"]|null;
}

type Props = InputProps & MappedProps;

class View extends React.PureComponent<Props> {

    render() {
        if (this.props.status === null) {
            return null;
        }
        switch(this.props.status) {
            case "initialConfirm":
                return <InitialConfirm/>;
            case "running":
            case "paused":
            case "done":
                return <Progress/>;
            default:
                console.log('unknown status', this.props.status);
                return null;
        }
    }

    static mapStateToProps(store: Store.Content, ownProps: InputProps):MappedProps {
        const astrometry = store.backend.astrometry;
        if (astrometry === undefined || astrometry.runningWizard === null || astrometry.runningWizard.polarAlignment === undefined) {
            return {
                status: null
            }
        }

        return {
            status: astrometry.runningWizard.polarAlignment.status
        };
    }
}

export default Store.Connect(View);