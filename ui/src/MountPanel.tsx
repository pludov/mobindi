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
import DeviceSettingsBton from './DeviceSettingsBton';

import "./MountPanel.css"
import IndiPropertyView from './indiview/IndiPropertyView';
import IndiSelectorPropertyView from './indiview/IndiSelectorPropertyView';
import ScopePositionSelector from './Wizard/PolarAlignment/ScopePositionSelector';

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

class ScopePanel extends PureComponent<Props> {
    static scopeSelectorHelp = Help.key("INDI mount device", "The coordinates of this INDI mount device will be used/adjusted during astrometry process.");

    
    
    constructor(props:Props) {
        super(props);
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
        <div className="ScopeView">

                <ScopeSelector setValue={this.setScope} helpKey={ScopePanel.scopeSelectorHelp}/>
                <DeviceConnectBton.forActivePath
                        activePath="$.backend.astrometry.selectedScope"
                        />
                <DeviceSettingsBton deviceId={this.props.currentScope || null}/>

                <DeviceGeolocBton
                        activePath="$.backend.astrometry.selectedScope"
                        />
                <div className="scope_coord_group">
                    <div className="scope_coord_group_title">Mount</div>
                    <div className="scope_coord_group_content">
                        <div className="scope_coord_line">
                            <div className="scope_coord_title">RA:</div>
                            <div className="scope_coord_value">23h52m12.2s</div>
                        </div>
                        <div className="scope_coord_line">
                            <div className="scope_coord_title">DEC:</div>
                            <div className="scope_coord_value">+92°02'15.2"</div>
                        </div>
                        <div className="scope_coord_line">
                            <div className="scope_coord_title">AH:</div>
                            <div className="scope_coord_value"> 23h59m12.2s</div>
                        </div>

                        <div className="scope_coord_line">
                            <div className="scope_coord_title">Pier:</div>
                            <div className="scope_coord_value">EAST</div>
                        </div>

                        <div className="scope_coord_line_separator"></div>

                        <div className="scope_coord_line">
                            <div className="scope_coord_title">Lat:</div>
                            <div className="scope_coord_value">+45°02'15.2"</div>
                        </div>
                        <div className="scope_coord_line">
                            <div className="scope_coord_title">Long:</div>
                            <div className="scope_coord_value">+02°02'15.2"</div>
                        </div>
                    </div>

                </div>

                <div className="scope_coord_group">
                    <div className="scope_coord_group_title">J2000</div>
                    <div className="scope_coord_group_content">
                        <div className="scope_coord_line">
                            <div className="scope_coord_title">RA:</div>
                            <div className="scope_coord_value">23h52m12.2s</div>
                        </div>
                        <div className="scope_coord_line">
                            <div className="scope_coord_title">DEC:</div>
                            <div className="scope_coord_value">+92°02'15.2"</div>
                        </div>
                    </div>
                </div>
                <div>

                <ScopePositionSelector moveAllowed={true}/>
                </div>


                <div>
                    Track: 
                    <IndiSelectorPropertyView dev={this.props.currentScope || ""}
                                                            vec="TELESCOPE_TRACK_MODE"
                                                            />
                    <input
                        className="GlyphBton"
                        type='button'
                        value='▶'
                        id='Start'
                        disabled={false}
                        onClick={(e)=>{}}
                    />
    

                </div>


                <input type="button" value="PARK" className="scope_panel_wizard_button"
                        />

                <input type="button" value="Polar align" className="scope_panel_wizard_button" />                                        
                <input type="button" value="Meridian flip" className="scope_panel_wizard_button" />                                        


        </div>);
    }

    static mapStateToProps = (store: Store.Content, props: InputProps):MappedProps=> {
        return {
            currentScope: store.backend?.astrometry?.selectedScope
        }
    }
}

export default Store.Connect(ScopePanel);