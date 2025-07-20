import { deepEqual } from '../../shared/Obj';
import React from 'react';
import '../BaseView.css';
import * as Store from "../../Store";
import SkyProjection from '../../SkyAlgorithms/SkyProjection';
import * as PolarAlignment from '../../SkyAlgorithms/PolarAlignment';
import './ScopePositionSelector.css';
import * as IndiUtils from '../../IndiUtils';
import * as IndiStore from '../../IndiStore';
import { defaultMemoize } from 'reselect';
import ScopeJoystick from '../../ScopeJoystick';
import { PolarAlignSettings, PolarAlignStatus } from '@bo/BackOfficeStatus';
import MiniMap from '../../MiniMap/MiniMap';
import UniformBackground from '../../MiniMap/UniformBackground';
import Marker from '../../MiniMap/Marker';
import ComplexBackground from '../../MiniMap/ComplexBackground';
import ScopeMarker from '../../MiniMap/ScopeMarker';

type InputProps = {
    moveAllowed: boolean;
};
type MappedProps = {
    currentScope: string;
    gradient: string[][]|undefined;
    scopeAltAz: undefined|{alt: number, az: number};
    steps?: Array<{alt: number, az: number}>;
    stepsProblem?: string;
}
type Props = InputProps & MappedProps;


type PolarAlignSettingsForSteps = Pick<PolarAlignSettings, "angle"|"minAltitude"|"sampleCount"|"meridianGuard">;

class ScopePositionSelector extends React.PureComponent<Props> {
    
    constructor(props:Props) {
        super(props);
    }

    render() {
        return <>
            <div className="PolarAlignExplain">
                <div className="ScopeOrientationViewContainer">
                    <div>
                        <MiniMap>
                            {this.props.gradient  ?
                                <ComplexBackground  gradient={this.props.gradient} />
                            :
                                <UniformBackground/>
                            }
                            {
                                this.props.steps ?
                                    this.props.steps.map((e,i) => 
                                        <Marker className="polar_align_scope_step"
                                            key={`step-${i}`}
                                            alt={e.alt}
                                            az={e.az}
                                            style={{ background: 'rgba(255, 255, 255, 0.5)' }}
                                        />
                                    )
                                : null
                            }
                            <ScopeMarker
                                className="polar_align_scope"
                                device={this.props.currentScope}/>
                        </MiniMap>

                    </div>
                    <div className="polar_align_sky_view_control">
                        {this.props.moveAllowed ?
                            <div className="ScopeJoystickContainer">
                                <ScopeJoystick imagingSetup="unused"/>
                            </div>
                        : null }
                    </div>
                    {
                        this.props.stepsProblem ?
                            <div className="polar_align_sky_view_warning">
                                <span>{this.props.stepsProblem}</span>
                            </div>
                        : null
                    }
                </div>

            </div>
        </>;
    }


    static buildGradientFromAxis(axis:  {alt:number, az:number}) {
        let result: string[][];

        result = [];
        const alt_step = 16;
        const az_step = 64;
        for(let alt_id = 0; alt_id < alt_step; ++alt_id) {
            const alt_values: string[] = [];

            const alt = 90 * (alt_id + 0.5) / alt_step;

            // FIXME: lower the number of az step for higher alt
            for(let az_id = 0; az_id < az_step; ++az_id) {
                const az = 360 * (az_id + 0.5) / az_step;

                let e = PolarAlignment.evalPolarAlignmentPosition({alt, az}, axis);

                // Push a color
                let color;
                if (e.alt_norm < PolarAlignment.minimumAxeRatio || e.az_norm < PolarAlignment.minimumAxeRatio) {
                    color = "red";
                } else if (e.eval_angle < PolarAlignment.orthogonalityThreshold[1]) {
                    color = "red";
                } else {
                    // Ramp between #F0A000 to dark green: #008F00
                    const src = [ 0xF0, 0xA0, 0x00];
                    const dst = [ 0x00, 0x8F, 0x00];

                    const linear = (e.eval_angle - PolarAlignment.orthogonalityThreshold[1]) / (90 - PolarAlignment.orthogonalityThreshold[1]);
                    const ramp = linear * linear;

                    const rgb = src
                                .map((e, i) => Math.round(e + ramp * (dst[i] - e)))
                                .map(e=>e.toString(16).padStart(2, '0'))
                                .join('');
                    color = `#${rgb}`;
                }
                alt_values.push(color);
            }

            result.push(alt_values);
        }
        return result;
    }


    static getAxis(store: Store.Content, currentScope:string) {
        const geoCoords = IndiStore.getMountGeoCoords(store, currentScope);
        if (geoCoords !== undefined) {
            const axis: {alt:number, az:number}|null|undefined = store.backend.astrometry?.runningWizard?.polarAlignment?.axis ||
            {
                alt: geoCoords.lat,
                az: 0,
            };
            return axis;
        } else {
            return undefined;
        }
    }

    static roundScopeAltAz(input: { alt:number, az:number}|undefined) {
        if (!input) return undefined;
        let scopeAltAz = {...input};
        scopeAltAz.alt = Math.round(scopeAltAz.alt);
        scopeAltAz.az = Math.round(scopeAltAz.az);
        return scopeAltAz;
    }

    static getStepSettings(store: Store.Content): PolarAlignSettingsForSteps|undefined {
        const settings = store.backend.astrometry?.settings?.polarAlign;
        if (settings) {
            return {
                angle: settings.angle,
                minAltitude: settings.minAltitude,
                sampleCount: settings.sampleCount,
                meridianGuard: settings.meridianGuard,
            };
        }
        return undefined;
    }

    static getAstrometryWizardStatus(store: Store.Content): PolarAlignStatus|undefined {
        return store.backend.astrometry?.runningWizard?.polarAlignment || undefined;
    }
    static computeStepsAltAzFromSettings(geoCoords: {lat: number, long:number}, raDecScope : {ra: number, dec: number}, now: number, 
            settings: PolarAlignSettingsForSteps,
            status: PolarAlignStatus|undefined,
                
    ): Pick<MappedProps, "steps"|"stepsProblem"> {
        if (settings.sampleCount < 3) {
            return { stepsProblem: "Not enough samples"};
        }
        let raRange;
        if (status !== undefined && status.startRelRa !== null && status.endRelRa !== null) {
            raRange = {
                start: status.startRelRa,
                end: status.endRelRa
            };
        } else {
            // Compute RA range
            // This may throw if the scope is too low above horizon..
            try  {
                raRange  = PolarAlignment.computeRaRange(
                                        geoCoords,
                                        raDecScope,
                                        now / 1000,
                                        settings);
            } catch(e) {
                return { stepsProblem: e.message};
            }
        }

        const ret: Array<{alt: number, az: number}> = [];
        for(let i = 0; i < settings.sampleCount; ++i) {
            let fact = i / (settings.sampleCount - 1);
            const scopeAltAz = SkyProjection.lstRelRaDecToAltAz({relRaDeg: 15 * (raRange.start  + fact * (raRange.end - raRange.start)), dec: raDecScope.dec}, geoCoords);
            ret.push(scopeAltAz);
        }

        return {steps: ret};
    }

    static computeStepsAltAz() {

        const getGeoCoords = defaultMemoize(IndiStore.getMountGeoCoords, {
            resultEqualityCheck: deepEqual, 
        });

        const getScopePos = defaultMemoize(IndiStore.getMountPos, {
            resultEqualityCheck: deepEqual
        })

        const getStepSettings = defaultMemoize(ScopePositionSelector.getStepSettings, {
            resultEqualityCheck: deepEqual 
        })

        const computeStepsAltAzFromSettings = defaultMemoize(ScopePositionSelector.computeStepsAltAzFromSettings, {
            resultEqualityCheck: deepEqual
        });

        return (store: Store.Content, scope: string): Pick<MappedProps, "steps" | "stepsProblem"> => {
            const geoCoords = getGeoCoords(store, scope);
            if (!geoCoords) {
                return {};
            }
            const scopePos = getScopePos(store, scope);
            if (!scopePos) {
                return {};
            }
            const stepSettings = getStepSettings(store);
            if (!stepSettings) {
                return {};
            }
            let now = new Date().getTime();
            // Round to the second
            now = Math.trunc(now / 1000) * 1000;

            const astrometryWizardStatus = ScopePositionSelector.getAstrometryWizardStatus(store);
            
            return computeStepsAltAzFromSettings(geoCoords, scopePos, now, stepSettings, astrometryWizardStatus);
        };
    }
    
    static mapStateToProps() {
        
        const computeGradient = defaultMemoize(ScopePositionSelector.buildGradientFromAxis, {
            equalityCheck: deepEqual,
            resultEqualityCheck: deepEqual, 
        });

        const roundScopeAltAz = defaultMemoize(ScopePositionSelector.roundScopeAltAz, {
            resultEqualityCheck: deepEqual
        });

        const computeStepsAltAz = ScopePositionSelector.computeStepsAltAz();

        return (store: Store.Content, props: InputProps):MappedProps => {
            const currentScope = store.backend.astrometry?.selectedScope || "";
            const axis = ScopePositionSelector.getAxis(store, currentScope);
            const now = new Date().getTime();
            const scopeAltAz = roundScopeAltAz(IndiStore.getMountAltAz(store, currentScope, now));
            const stepProps = computeStepsAltAz(store, currentScope);
            return {
                currentScope,
                gradient: axis ? computeGradient(axis) : undefined,
                scopeAltAz,
                ...stepProps,
            }
        }
    }

}

export default Store.Connect(ScopePositionSelector);
