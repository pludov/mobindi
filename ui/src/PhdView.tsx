/**
 * Created by ludovic on 18/07/17.
 */
import * as React from 'react';

import chartjs from "chart.js";
import * as ReactChartJS from "react-chartjs-2";
import moment from 'moment';

import * as Store from "./Store";
import * as BackendRequest from "./BackendRequest";
import './PhdView.css';
import { PhdStatus } from '@bo/BackOfficeStatus';
import CancellationToken from 'cancellationtoken';

const StatusForGuiding = ["Paused", "Looping", "Stopped", "LostLock" ];


type InputProps = {}
type MappedProps = {
    phd: PhdStatus|undefined;
}
type Props = InputProps & MappedProps;

// Afficher l'état de phd et permet de le controller
class PhdView extends React.PureComponent<Props> {
    constructor(props:Props) {
        super(props);
    }

    startGuide = async ()=> {
        await BackendRequest.RootInvoker("phd")("startGuide")(CancellationToken.CONTINUE, {});
    }

    stopGuide = async ()=>{
        await BackendRequest.RootInvoker("phd")("stopGuide")(CancellationToken.CONTINUE, {});
    }

    render() {
        var bs = this.props.phd;
        if (bs == undefined || bs == null) {
            return null;
        }

        function formatNumber(n:number|undefined|null)
        {
            if (n == undefined || n == null) return n;
            if (typeof(n) == 'number') {
                return n.toFixed(2);
            }
            return "?" + n;
        }

        var chartData: ReactChartJS.ChartData<chartjs.ChartData>= {
            datasets: []
        };
        const props = [
            {prop: 'RADistanceRaw', color:'#ff0000'},
            {prop:'DECDistanceRaw', color:'#0000ff'},
            {prop: 'settling', color: '#808080',
                    yAxisID: 'settling',
                    backgroundColor: 'rgb(60,100,1)',
                    borderColor: 'rgba(0,0,0,0)',
                    borderWidth: 0,
                    pointRadius: 0,
                    fill: true,
                    stepped: false,
                    label: 'Settle',
                    flipFlop: true
                }
            ];

        let minMoment: string|undefined, maxMoment: string|undefined;

        for(var propDef of props) {
            var prop = propDef.prop;

            var data:chartjs.ChartDataSets = {
                label: prop,
                borderWidth: 1.5,
                borderColor: propDef.color,
                lineTension: 0,
                pointRadius: 1.0,
                cubicInterpolationMode: undefined,
                showLine: false,
                data: []
            }
            for(var o of Object.keys(propDef)) {
                if ((o == "prop" || o == "color")) continue;
                data[o] = propDef[o];
            }

            var rawDatas = bs.guideSteps;
            var flipFlop = propDef.flipFlop;
            let previous:number|null|undefined = undefined;
            if (rawDatas) {
                var keys = Array.from(Object.keys(rawDatas)).sort();
                var prev = undefined;
                for (var i =0; i < keys.length; ++i) {
                    var uid = keys[i];
                    var entry = rawDatas[uid];
                    
                    var ts = entry.Timestamp;
                    if (minMoment === undefined) {
                        minMoment = ts;
                        maxMoment = ts;
                    } else {
                        maxMoment = ts;
                    }

                    const value:number|null = prop in entry ? entry[prop] : null;
                    if (flipFlop) {
                        if ((previous !== undefined) && (previous === value)) {
                            continue;
                        }
                        data.data!.push({x:ts!, y:previous!} as any);
                        previous = value;
                    }
                    data.data!.push({x:ts!, y:value} as any);
                }
            }
            chartData.datasets!.push(data);
        }

        const chartOptions: chartjs.ChartOptions = {

            scales: {
                yAxes: [
                {
                    id: 'default',
                    type: 'linear',
                    ticks: {
                        beginAtZero: true,
                        min: -1.0,
                        max: 1.0
                    }
                },
                {
                    id: 'settling',
                    type: 'linear',
                    display: false,
                    ticks: {
                        beginAtZero: true,
                        min: 0,
                        max: 1.0
                    }
                }
                ],
                xAxes: [{
                    id: 'time',
                    type: 'time',
                    ticks: {
                        maxRotation: 0
                    },
                    time: {
                        parser: moment.unix,
                        // round: false,
                        min: minMoment,
                        max: maxMoment
                    }
                }]
            },
            animation: {
                duration: 0 // general animation time
            },

            maintainAspectRatio: false
        };

        return (
            <div className="Page">
                <div className={'PHDAppState PHDAppState_' + bs.AppState}>{bs.AppState}
                </div>
                <div>SNR:{bs.star != null ? bs.star.SNR : null}</div>
                <div className="PhdGraph_Item">
                    <div className="PhdGraph_Container">
                        <ReactChartJS.Line data={chartData} options={chartOptions} />
                    </div>
                </div>
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
                                <td>{formatNumber(bs.RADistanceRMS)}</td>
                                <td>{formatNumber(bs.RADistancePeak)}</td>
                            </tr>
                            <tr>
                                <td>DEC</td>
                                <td>{formatNumber(bs.DECDistanceRMS)}</td>
                                <td>{formatNumber(bs.DECDistancePeak)}</td>
                            </tr>
                            <tr>
                                <td>Total</td>
                                <td>{formatNumber(bs.RADECDistanceRMS)}</td>
                                <td>{formatNumber(bs.RADECDistancePeak)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div className="ButtonBar">
                <input type="button" value="Guide" onClick={this.startGuide}
                    disabled={StatusForGuiding.indexOf(bs.AppState) == -1}
                    />
                <input type="button" value="Stop" onClick={this.stopGuide}
                    disabled={bs.AppState == "Stopped"}
                    />
                </div>
            </div>);
    }

    static mapStateToProps = (store:Store.Content, ownProps: InputProps):MappedProps=>{
        var result = {
            phd: store.backend.phd
        };
        return result;
    }
}


export default Store.Connect(PhdView);