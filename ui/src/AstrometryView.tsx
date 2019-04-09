import { connect } from 'react-redux';

import React, { Component, PureComponent} from 'react';
import AstrometryApp from './AstrometryApp';
import PromiseSelector from './PromiseSelector';
import DeviceConnectBton from './DeviceConnectBton';
import PropertyEditor from './PropertyEditor';
import AstrometrySettingsView from './AstrometrySettingsView';
import BackendAccessor from './utils/BackendAccessor';
import * as Store from './Store';
import * as BackendRequest from "./BackendRequest";
import CancellationToken from 'cancellationtoken';

type Props = {
    app: AstrometryApp;
};

const ScopeSelector = connect((store:any)=> ({
    active: (store.backend && store.backend.astrometry) ? store.backend.astrometry.selectedScope : undefined,
    availables: (store.backend && store.backend.astrometry) ? store.backend.astrometry.availableScopes : []
}))(PromiseSelector);

class AstrometryBackendAccessor extends BackendAccessor {
    public apply = async (jsonDiff:any):Promise<void>=>{
        console.log('Sending changes: ' , jsonDiff);
        await BackendRequest.RootInvoker("astrometry")("updateCurrentSettings")(
            CancellationToken.CONTINUE,
            {diff: jsonDiff}
        );
    }
}

export default class AstrometryView extends PureComponent<Props> {
    accessor: BackendAccessor;
    constructor(props:Props) {
        super(props);
        this.accessor = new AstrometryBackendAccessor("$.astrometry.settings");
    }

    private setScope = async(deviceId:string)=> {
        return await BackendRequest.RootInvoker("astrometry")("setScope")(
            CancellationToken.CONTINUE,
            {
                deviceId
            }
        );
    }

    render() {
        return <div className="CameraView">
            <div>
                <ScopeSelector setValue={this.setScope}/>
                <DeviceConnectBton
                        activePath="$.backend.astrometry.selectedScope"
                        />
                <AstrometrySettingsView
                        accessor={this.accessor}/>
            </div>
        </div>;
    }
}