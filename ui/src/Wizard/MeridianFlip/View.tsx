import React from 'react';
import CancellationToken from 'cancellationtoken';
import Log from '../../shared/Log';
import '../../AstrometryView.css';
import AstrometrySettingsView from '../../AstrometrySettingsView';
import * as Store from '../../Store';
import * as IndiManagerStore from '../../IndiManagerStore';
import * as BackendRequest from "../../BackendRequest";
import { AstrometryWizards } from '@bo/BackOfficeAPI';
import { MeridianFlipStatus, PolarAlignStatus } from '@bo/BackOfficeStatus';
import InitialConfirm from "./InitialConfirm";
import "../PolarAlignment/PolarAlignment.css";

const logger = Log.logger(__filename);

type InputProps = {};
type MappedProps = {
    status: MeridianFlipStatus["status"]|null;
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
            default:
                logger.warn('unknown status', {status: this.props.status});
                return null;
        }
    }

    static mapStateToProps(store: Store.Content, ownProps: InputProps):MappedProps {
        const astrometry = store.backend.astrometry;
        if (!astrometry?.runningWizard?.meridianFlip) {
            return {
                status: null
            }
        }

        return {
            status: astrometry.runningWizard.meridianFlip.status
        };
    }
}

export default Store.Connect(View);