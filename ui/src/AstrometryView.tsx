import { connect } from 'react-redux';

import React, { Component, PureComponent} from 'react';
import AstrometryApp from './AstrometryApp';
import PromiseSelector from './PromiseSelector';
import DeviceConnectBton from './DeviceConnectBton';
import PropertyEditor from './PropertyEditor';
import AstrometrySettingsView from './AstrometrySettingsView';
import BackendAccessor from './utils/BackendAccessor';
import * as Store from './Store';

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
        await Store.getNotifier().sendRequest({'target': 'astrometry',
            method: 'updateCurrentSettings',
            diff: jsonDiff
        });
    }
}

export default class AstrometryView extends PureComponent<Props> {
    accessor: BackendAccessor;
    constructor(props:Props) {
        super(props);
        this.accessor = new AstrometryBackendAccessor("$.astrometry.settings");
    }

    render() {
        return <div className="CameraView">
            <div>
                <ScopeSelector setValue={async (e:string)=>await this.props.app.setScope({deviceId: e})}/>
                <DeviceConnectBton
                        activePath="$.backend.astrometry.selectedScope"
                        app={this.props.app}/>
                <AstrometrySettingsView
                        accessor={this.accessor}/>
            </div>
        </div>;
    }
}