/**
 * Created by ludovic on 18/07/17.
 */
import * as React from 'react';

import * as Store from "./Store";
import * as BackendRequest from "./BackendRequest";
import './PhdView.css';
import { PhdStatus } from '@bo/BackOfficeStatus';


type InputProps = {}
type MappedProps = {
    RADistanceRMS?:PhdStatus["RADistanceRMS"];
    DECDistanceRMS?:PhdStatus["DECDistanceRMS"];
    RADECDistanceRMS?:PhdStatus["RADECDistanceRMS"];
    RADistancePeak?:PhdStatus["RADistancePeak"];
    DECDistancePeak?:PhdStatus["DECDistancePeak"];
    RADECDistancePeak?:PhdStatus["RADECDistancePeak"];
}

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

    static mapStateToProps = (store:Store.Content, ownProps: InputProps):MappedProps=>{
        const phd = store.backend.phd;
        if (phd === undefined) {
            return {};
        }
        return {
            RADistanceRMS: phd.RADistanceRMS,
            DECDistanceRMS: phd.DECDistanceRMS,
            RADECDistanceRMS: phd.RADECDistanceRMS,
            RADistancePeak: phd.RADistancePeak,
            DECDistancePeak: phd.DECDistancePeak,
            RADECDistancePeak: phd.RADECDistancePeak,
        };
    }
}


export default Store.Connect(PhdStats);