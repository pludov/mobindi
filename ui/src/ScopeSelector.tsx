import { connect } from 'react-redux';
import CancellationToken from 'cancellationtoken';
import React, { Component, PureComponent} from 'react';
import PromiseSelector from './PromiseSelector';
import * as BackendRequest from "./BackendRequest";


const setScope = async(deviceId:string)=> {
    return await BackendRequest.RootInvoker("astrometry")("setScope")(
        CancellationToken.CONTINUE,
        {
            deviceId
        }
    );
}

export const ScopeSelector = connect((store:any)=> ({
    active: (store.backend && store.backend.astrometry) ? store.backend.astrometry.selectedScope : undefined,
    availables: (store.backend && store.backend.astrometry) ? store.backend.astrometry.availableScopes : [],
    setValue: setScope,
}))(PromiseSelector);


