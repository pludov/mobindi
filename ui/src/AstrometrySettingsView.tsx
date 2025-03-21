import { connect } from 'react-redux';
import CancellationToken from 'cancellationtoken';
import React, { Component, PureComponent} from 'react';

import * as Help from "./Help";
import * as Store from './Store';
import Bool from './primitives/Bool';
import Int from './primitives/Int';
import Float from './primitives/Float';
import Conditional from './primitives/Conditional';
import PromiseSelector from './PromiseSelector';
import { RecursiveBackendAccessor } from './utils/BackendAccessor';
import DeviceConnectBton from './DeviceConnectBton';
import DeviceGeolocBton from './DeviceGeolocBton';
import * as AccessPath from './shared/AccessPath';
import * as BackendRequest from "./BackendRequest";
import * as AstrometryStore from "./AstrometryStore";
import { AstrometrySettings } from '@bo/BackOfficeStatus';
import IndiSelectorEditor from './IndiSelectorEditor';

const ScopeSelector = connect((store:Store.Content)=> ({
    active: store.backend?.astrometry?.selectedScope,
    availables: store.backend?.indiManager?.availableScopes || []
}))(PromiseSelector);

type InputProps = {
    close: ()=>(void);
}

type MappedProps = {
    currentScope: string|null|undefined;
}

type Props = InputProps & MappedProps;

class AstrometrySettingsView extends PureComponent<Props> {
    static scopeSelectorHelp = Help.key("INDI mount device", "The coordinates of this INDI mount device will be used/adjusted during astrometry process.");
    static initialSearchRadiusHelp = Help.key("Initial Search Radius", "Max distance (°) from the current mount coordinates to search on \"wide\" astrometry. This is used on \"wide\" astrometry search (first one, and after important moves).");
    static narrowedSearchRadiusHelp = Help.key("Synced search radius", "Max distance (°) from the current mount coordinates to search on \"narrow\" astrometry (after successfull one, if no important moves occured in between");
    static initialFieldHelp = Help.key("Initial field range", "Min an max value (°) for the initial estimation of field size of the images. This is used on \"wide\" astrometry search (first one, and after important moves)");
    static narrowedFieldPercentHelp = Help.key("Max field variation", "Tolerance in % from the previous field estimation. This is used on \"narrow\" astrometry search (after successfull one, if no important moves occured in between");
    static useMountPositionHelp = Help.key("Use mount position", "Use the mount coordinates to fasten astrometry search. The first astrometry will use \"wide\" settings, then use narrower settings, unless the mount is moved substantially");
    static slewRateHelp = Help.key("Slew rate", "Choose slew rate for the mount moves. Refer to the INDI driver of the mount for actual meaning.");

    accessor: RecursiveBackendAccessor<AstrometrySettings>;
    
    constructor(props:Props) {
        super(props);
        this.accessor = AstrometryStore.astrometrySettingsAccessor();
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

                <ScopeSelector setValue={this.setScope} helpKey={AstrometrySettingsView.scopeSelectorHelp}/>
                <DeviceConnectBton.forActivePath
                        activePath="$.backend.astrometry.selectedScope"
                        />
                <DeviceGeolocBton
                        activePath="$.backend.astrometry.selectedScope"
                        />
                <div>
                    <div>
                        Initial field range (°):
                        <Float accessor={this.accessor.child(AccessPath.For((e)=>e.initialFieldMin))} min={0} max={90} helpKey={AstrometrySettingsView.initialFieldHelp}/>
                        to
                        <Float accessor={this.accessor.child(AccessPath.For((e)=>e.initialFieldMax))} min={0} max={90} helpKey={AstrometrySettingsView.initialFieldHelp}/>
                    </div>

                    <div>
                        Max field variation (%):
                        <Int accessor={this.accessor.child(AccessPath.For((e)=>e.narrowedFieldPercent))} min={0} max={100} helpKey={AstrometrySettingsView.narrowedFieldPercentHelp}/>
                    </div>
                    <div>
                        <div>
                            Use mount position: <Bool accessor={this.accessor.child(AccessPath.For((e)=>e.useMountPosition))} helpKey={AstrometrySettingsView.useMountPositionHelp}/>
                        </div>
                        <Conditional accessor={this.accessor.child(AccessPath.For((e)=>e.useMountPosition))}>
                        <div>
                            Initial search radius (°):
                            <Float accessor={this.accessor.child(AccessPath.For((e)=>e.initialSearchRadius))} min={0} max={180} helpKey={AstrometrySettingsView.initialSearchRadiusHelp}/>
                        </div>
                        <div>
                            Synced search radius (°):
                            <Float accessor={this.accessor.child(AccessPath.For((e)=>e.narrowedSearchRadius))} min={0} max={180}helpKey={AstrometrySettingsView.narrowedSearchRadiusHelp}/>
                        </div>
                        </Conditional>
                    </div>
                    <div>
                        Unsynced slew :
                        <div>
                            <IndiSelectorEditor
                                device={this.props.currentScope || ""}
                                // FIXME: use accessor here
                                valuePath="$.backend.astrometry.settings.fineSlew.slewRate"
                                setValue={this.accessor.child(AccessPath.For((e)=>e.fineSlew.slewRate)).send}
                                vecName="TELESCOPE_SLEW_RATE"
                                helpKey={AstrometrySettingsView.slewRateHelp}
                            />

                        </div>
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

    static mapStateToProps = (store: Store.Content, props: InputProps):MappedProps=> {
        return {
            currentScope: store.backend?.astrometry?.selectedScope
        }
    }
}

export default Store.Connect(AstrometrySettingsView);