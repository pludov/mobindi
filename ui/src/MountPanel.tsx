import { connect } from 'react-redux';
import CancellationToken from 'cancellationtoken';
import React, { Component, PureComponent} from 'react';
import numeral from 'numeral';
import * as Help from "./Help";
import * as Store from './Store';
import PromiseSelector from './PromiseSelector';
import DeviceConnectBton from './DeviceConnectBton';
import DeviceGeolocBton from './DeviceGeolocBton';
import * as BackendRequest from "./BackendRequest";
import DeviceSettingsBton from './DeviceSettingsBton';

import * as AccessPath from './shared/AccessPath';
import "./MountPanel.css"
import IndiSelectorPropertyView from './indiview/IndiSelectorPropertyView';
import ScopePositionSelector from './Wizard/PolarAlignment/ScopePositionSelector';
import { AstrometryWizards } from '@bo/BackOfficeAPI';
import { getMountRichPosFromStore, MountRichPos } from './MountStore';
import MountParkButton from './MountParkButton';
import MountTrackButton from './MountTrackButton';
import AstrometrySettingsView from './AstrometrySettingsView';
import AstrometryStatusView from './AstrometryStatusView';
import MiniMap from './MiniMap/MiniMap';
import UniformBackground from './MiniMap/UniformBackground';
import ScopeMarker from './MiniMap/ScopeMarker';
import ScopeJoystick from './ScopeJoystick';
import IndiSelectorEditor from './IndiSelectorEditor';
import * as AstrometryStore from "./AstrometryStore";

const ScopeSelector = connect((store:Store.Content)=> ({
    active: store.backend?.astrometry?.selectedScope,
    availables: store.backend?.indiManager?.availableScopes || []
}))(PromiseSelector);

type InputProps = {
}

type MappedProps = {
    currentScope: string|null|undefined;
} & Partial<MountRichPos>;

type Props = InputProps & MappedProps;


function to_hms(value: number, precision: number = 1) {
    const factor = Math.pow(10, precision);

    const fractions = Math.round(value * 3600 * factor);

    const h = Math.floor(fractions / (3600 * factor));
    const m = Math.floor((fractions % (3600 * factor)) / (60 * factor));
    const s = (fractions % (60 * factor)) / factor;

    return {h, m, s};
}

function format_ra(ra: number | undefined): string {
    if (ra === undefined) {
        return "N/A";
    }
    ra = ra % 360;
    if (ra < 0) {
        ra += 360;
    }
    let hms = to_hms(ra / 15, 1); // Convert RA from degrees to hours (1 hour = 15 degrees)
    // The first space is intentional, to line up with the DEC format that includes a +/- sign.
    return ` ${numeral(hms.h).format('00')}h${numeral(hms.m).format('00')}m${numeral(hms.s).format('00.0')}s`;
}

function format_dec(dec: number | undefined): string {
    if (dec === undefined) {
        return "N/A";
    }
    const sign = dec < 0 ? '-' : '+';

    dec = Math.abs(dec);

    let hms = to_hms(dec, 1);
    return `${sign}${numeral(hms.h).format('00')}°${numeral(hms.m).format('00')}′${numeral(hms.s).format('00.0')}″`;
}

function format_latitude(latitude: number | undefined): string {
    return format_dec(latitude);
}

function format_longitude(longitude: number | undefined): string {
    if (longitude === undefined) {
        return "N/A";
    }
    // Longitude is typically in the range of -180 to +180 degrees.
    longitude = longitude % 360;
    if (longitude < 0) {
        longitude += 360;
    }
    if (longitude > 180) {
        longitude -= 360; // Convert to -180 to +180 range
    }
    return format_dec(longitude);
}


class ScopePanel extends PureComponent<Props> {
    static scopeSelectorHelp = Help.key("INDI mount device", "The coordinates of this INDI mount device will be used/adjusted during astrometry process.");
    static slewRateHelp = Help.key("Slew rate", "Choose slew rate for the mount moves. Refer to the INDI driver of the mount for actual meaning.");

    private astrometryAccessor = AstrometryStore.astrometrySettingsAccessor();

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

    private onStartWizard = async(id: keyof AstrometryWizards) => {
        await BackendRequest.RootInvoker("astrometry")(id)(
            CancellationToken.CONTINUE,
            { }
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

                <div className="scope_coord_group">
                    <div className="scope_coord_group_title">Mount</div>
                    <div className="scope_coord_group_content">
                        <div className="scope_coord_line">
                            <div className="scope_coord_title">RA:</div>
                            <div className="scope_coord_value">{format_ra(this.props.ra_jnow)}</div>
                        </div>
                        <div className="scope_coord_line">
                            <div className="scope_coord_title">DEC:</div>
                            <div className="scope_coord_value">{format_dec(this.props.dec_jnow)}</div>
                        </div>
                        <div className="scope_coord_line">
                            <div className="scope_coord_title">HA:</div>
                            <div className="scope_coord_value">{format_ra(this.props.ha_jnow)}</div>
                        </div>

                        <div className="scope_coord_line">
                            <div className="scope_coord_title">Pier:</div>
                            <div className="scope_coord_value">{this.props.pier_side?.toUpperCase() || "N/A"}</div>
                        </div>

                        <div className="scope_coord_line_separator"></div>

                        <div className="scope_coord_line">
                            <div className="scope_coord_title">Long:</div>
                            <div className="scope_coord_value">{format_longitude(this.props.longitude)}</div>
                        </div>
                        <div className="scope_coord_line">
                            <div className="scope_coord_title">Lat:</div>
                            <div className="scope_coord_value">{format_latitude(this.props.latitude)}</div>
                        </div>
                    </div>

                </div>

                <div className="scope_coord_group">
                    <div className="scope_coord_group_title">J2000</div>
                    <div className="scope_coord_group_content">
                        <div className="scope_coord_line">
                            <div className="scope_coord_title">RA:</div>
                            <div className="scope_coord_value">{format_ra(this.props.ra_j2000)}</div>
                        </div>
                        <div className="scope_coord_line">
                            <div className="scope_coord_title">DEC:</div>
                            <div className="scope_coord_value">{format_dec(this.props.dec_j2000)}</div>
                        </div>
                    </div>
                </div>
                <div className="scope_minimap_group">
                        <div>
                            <MiniMap className="scope_minimap_big">
                                <UniformBackground className="scope_minimap_big"/>
                                {this.props.currentScope ?
                                    <ScopeMarker
                                        device={this.props.currentScope}
                                        className="scope_minimap_big"
                                        />
                                    : null}
                            </MiniMap>
                        </div>
                        <div>
                            <div className="ScopeJoystickContainer">
                                <ScopeJoystick imagingSetup="unused"/>
                            </div>
                            {/* <ScopePositionSelector moveAllowed={true}/> */}
                            <div>
                                Speed:
                                    <IndiSelectorEditor
                                        device={this.props.currentScope || ""}
                                        // FIXME: use accessor here
                                        valuePath="$.backend.astrometry.settings.fineSlew.slewRate"
                                        setValue={this.astrometryAccessor.child(AccessPath.For((e)=>e.fineSlew.slewRate)).send}
                                        vecName="TELESCOPE_SLEW_RATE"
                                        helpKey={ScopePanel.slewRateHelp}
                                    />
                            </div>
                            <div>
                                Track: 
                                <IndiSelectorPropertyView dev={this.props.currentScope || ""}
                                                                        vec="TELESCOPE_TRACK_MODE"
                                                                        />
                            
                                <MountTrackButton scope={this.props.currentScope || ""} />
                            </div>

                        </div>

                </div>



                <div className="scope_wizard_group">

                    <div><MountParkButton scope={this.props.currentScope}/></div>
                    <div><input type="button" value="Polar align" className="scope_panel_wizard_button" onClick={() => {this.onStartWizard('startPolarAlignmentWizard')}}/></div>
                    <div><input type="button" value="Meridian flip" className="scope_panel_wizard_button" onClick={() => {this.onStartWizard('startMeridianFlipWizard')}}/></div>
                </div>

        </div>);
    }

    static mapStateToProps = (store: Store.Content, props: InputProps):MappedProps=> {
        const currentScope = store.backend?.astrometry?.selectedScope;
        
        const richPos = currentScope !== null && currentScope !== undefined
                            ? getMountRichPosFromStore(store, currentScope, new Date().getTime())
                            : null;
        // FIXME : detect if an activity is running, to disable some buttons:
        //        - parking/unparking
        //        - goto
        //        - slewing
        return {
            currentScope,
            ...richPos
        }
    }
}

export default Store.Connect(ScopePanel);