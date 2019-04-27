import { connect } from 'react-redux';
import CancellationToken from 'cancellationtoken';
import React, { Component, PureComponent} from 'react';

import Bool from './primitives/Bool';
import Int from './primitives/Int';
import Conditional from './primitives/Conditional';
import PromiseSelector from './PromiseSelector';
import BackendAccessor from './utils/BackendAccessor';
import DeviceConnectBton from './DeviceConnectBton';
import DeviceGeolocBton from './DeviceGeolocBton';
import * as BackendRequest from "./BackendRequest";

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

type Props = {
    close: ()=>(void);
}

export default class AstrometrySettingsView extends PureComponent<Props> {
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

    public render() {
        return (
        <div className="AstrometryWizardRootView">
            <div className="AstrometryWizardContent">

                <div className="AstrometryWizardSelectTitle">Astrometry Settings</div>

                <ScopeSelector setValue={this.setScope}/>
                <DeviceConnectBton
                        activePath="$.backend.astrometry.selectedScope"
                        />
                <DeviceGeolocBton
                        activePath="$.backend.astrometry.selectedScope"
                        />
                <div>
                    <div>
                        Initial field range (°):
                        <Int accessor={this.accessor.child('$.initialFieldMin')}>
                        </Int>
                        to
                        <Int accessor={this.accessor.child('$.initialFieldMax')}>
                        </Int>
                    </div>

                    <Int accessor={this.accessor.child('$.narrowedFieldPercent')}>
                        Max field variation (%)
                    </Int>

                    <div>
                        <div>
                            <Bool accessor={this.accessor.child('$.useMountPosition')}>Use mount position</Bool>
                        </div>
                        <Conditional accessor={this.accessor.child("$.useMountPosition")} condition={(e:boolean)=>(!e)}>
                        <div>
                            <Int accessor={this.accessor.child('$.initialSearchRadius')}>
                                Initial search radius (°)
                            </Int>
                        </div>
                        <div>
                            <Int accessor={this.accessor.child('$.narrowedSearchRadius')}>
                                Synced search radius (°)
                            </Int>
                        </div>
                        </Conditional>
                    </div>
                </div>
            </div>
            <div className="AstrometryWizardControls">
                <input type="button" value="Done" onClick={this.props.close}
                       className="WizardRightButton"
                    />
            </div>
        </div>);
    }
}