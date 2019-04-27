import * as React from 'react';
import { connect } from 'react-redux';

import * as BackendRequest from "./BackendRequest";
import * as Store from "./Store";
import PromiseSelector from './PromiseSelector';
import './CameraView.css'


export default connect((store:Store.Content)=> ({
    active: store.backend && store.backend.camera ? store.backend.camera.selectedDevice : undefined,
    availables: store.backend && store.backend.camera ? store.backend.camera.availableDevices : []
}))(PromiseSelector);
