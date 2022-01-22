/**
 * Created by ludovic on 18/07/17.
 */
import * as React from 'react';

import { createSelector } from 'reselect';
import * as Store from "./Store";
import * as GuideStats from "./shared/GuideStats";
import './PhdView.css';
import * as PhdGraph from "./PhdGraph";
import { PhdGuideStats, PhdGuideStep } from '@bo/BackOfficeStatus';


type InputProps = {}
type MappedProps = PhdGuideStats;

type Props = InputProps & MappedProps;

type State = {}

class PhdStats extends React.PureComponent<Props, State> {
    constructor(props:Props) {
        super(props);
        this.state = {}
    }

    render() {
        function formatNumber(n:number|undefined|null)
        {
            if (n == undefined || n == null) return n;
            if (typeof(n) == 'number') {
                return n.toFixed(2);
            }
            return "?" + n;
        }

        return (
            <>
                <div>
                    <table className="RADECTable">
                        <tbody>
                            <tr>
                                <td></td>
                                <td>RMS</td>
                                <td>Peak</td>
                            </tr>
                            <tr>
                                <td>RA</td>
                                <td>{formatNumber(this.props.RADistanceRMS)}</td>
                                <td>{formatNumber(this.props.RADistancePeak)}</td>
                            </tr>
                            <tr>
                                <td>DEC</td>
                                <td>{formatNumber(this.props.DECDistanceRMS)}</td>
                                <td>{formatNumber(this.props.DECDistancePeak)}</td>
                            </tr>
                            <tr>
                                <td>Total</td>
                                <td>{formatNumber(this.props.RADECDistanceRMS)}</td>
                                <td>{formatNumber(this.props.RADECDistancePeak)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </>);
    }

    static emptyGuideState: PhdGuideStats = {
        DECDistancePeak: null,
        DECDistanceRMS: null,
        RADECDistancePeak: null,
        RADECDistanceRMS: null,
        RADistancePeak: null,
        RADistanceRMS: null,
    };

    static mapStateToProps = ():(store:Store.Content, ownProps: InputProps)=>MappedProps=>{

        return createSelector(
            PhdGraph.currentRangeAccessor,
            (store: Store.Content)=>store.backend.phd,
            (store: Store.Content)=>store.backend.phd?.guideSteps,
            (viewRange, phd, guideSteps)=> {
                if (phd === undefined || guideSteps === undefined) {
                    return PhdStats.emptyGuideState;
                }

                let min, max;
                if (viewRange.track) {
                    max = 0;
                    for(const id of Object.keys(guideSteps)) {
                        const step = guideSteps[id];
                        if (step.Timestamp > max) {
                            max = step.Timestamp;
                        }
                    }
                    max *= 1000;
                    min = max - viewRange.width!;
                } else {
                    min = viewRange.min!;
                    max = viewRange.max!;
                }

                const selected: Array<PhdGuideStep> = [];
                for(const id of Object.keys(guideSteps)) {
                    const step = guideSteps[id];
                    const time = 1000 * step.Timestamp;
                    if (time >= min && time <= max && !step.settling) {
                        selected.push(step);
                    }
                }

                if (selected.length === 0) {
                    return PhdStats.emptyGuideState;
                }

                const stats = GuideStats.computeGuideStats(selected);

                return stats;
            }
        );
    }
}


export default Store.Connect(PhdStats);