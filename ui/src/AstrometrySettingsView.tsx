import { connect } from 'react-redux';
import CancellationToken from 'cancellationtoken';
import React, { Component, PureComponent} from 'react';

import Bool from './primitives/Bool';
import Int from './primitives/Int';
import Float from './primitives/Float';
import Conditional from './primitives/Conditional';
import PromiseSelector from './PromiseSelector';
import BackendAccessor from './utils/BackendAccessor';
import DeviceConnectBton from './DeviceConnectBton';
import DeviceGeolocBton from './DeviceGeolocBton';
import * as BackendRequest from "./BackendRequest";
import AstrometryBackendAccessor from "./AstrometryBackendAccessor";
import { AstrometrySettings } from '@bo/BackOfficeStatus';

const ScopeSelector = connect((store:any)=> ({
    active: (store.backend && store.backend.astrometry) ? store.backend.astrometry.selectedScope : undefined,
    availables: (store.backend && store.backend.astrometry) ? store.backend.astrometry.availableScopes : []
}))(PromiseSelector);


type Props = {
    close: ()=>(void);
}

export default class AstrometrySettingsView extends PureComponent<Props> {
    accessor: BackendAccessor<AstrometrySettings>;
    
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
                        <Float accessor={this.accessor.child('initialFieldMin')} min={0} max={90}/>
                        to
                        <Float accessor={this.accessor.child('initialFieldMax')} min={0} max={90}/>
                    </div>

                    <Int accessor={this.accessor.child('narrowedFieldPercent')} min={0} max={100}>
                        Max field variation (%)
                    </Int>

                    <div>
                        <div>
                            <Bool accessor={this.accessor.child('useMountPosition')}>Use mount position</Bool>
                        </div>
                        <Conditional accessor={this.accessor.child("useMountPosition")} condition={(e:boolean)=>(!e)}>
                        <div>
                            <Int accessor={this.accessor.child('initialSearchRadius')} min={0} max={180}>
                                Initial search radius (°)
                            </Int>
                        </div>
                        <div>
                            <Int accessor={this.accessor.child('narrowedSearchRadius')} min={0} max={180}>
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