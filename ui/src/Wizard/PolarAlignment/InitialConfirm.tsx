import React from 'react';
import CancellationToken from 'cancellationtoken';
import '../../AstrometryView.css';
import AstrometrySettingsView from '../../AstrometrySettingsView';
import * as Store from '../../Store';
import * as IndiManagerStore from '../../IndiManagerStore';
import * as BackendRequest from "../../BackendRequest";
import { AstrometryWizards } from '@bo/BackOfficeAPI';


type Props = {};

export default class InitialConfirm extends React.PureComponent<Props> {

    render() {
        return <>
            Point the scope to the place of the sky where you’ll take image.
            Then click next to proceed.
        </>
    }
}

