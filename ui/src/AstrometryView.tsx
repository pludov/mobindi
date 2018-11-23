import { connect } from 'react-redux';

import React, { Component, PureComponent} from 'react';
import AstrometryApp from './AstrometryApp';
import PromiseSelector from './PromiseSelector';
import DeviceConnectBton from './DeviceConnectBton';

type Props = {
    app: AstrometryApp;
};

const ScopeSelector = connect((store:any)=> ({
    active: (store.backend && store.backend.astrometry) ? store.backend.astrometry.selectedScope : undefined,
    availables: (store.backend && store.backend.astrometry) ? store.backend.astrometry.availableScopes : []
}))(PromiseSelector);


export default class AstrometryView extends PureComponent<Props> {
    constructor(props:Props) {
        super(props);
    }

    render() {
        return <div className="CameraView">
            <div>
                <ScopeSelector setValue={(e:string)=>this.props.app.setScope({deviceId: e})}/>
                <DeviceConnectBton
                        activePath="$.backend.astrometry.selectedScope"
                        app={this.props.app}/>
            </div>
        </div>;
    }
}