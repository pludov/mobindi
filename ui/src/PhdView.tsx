/**
 * Created by ludovic on 18/07/17.
 */
import * as React from 'react';

import chartjs from "chart.js";
import * as ReactChartJS from "react-chartjs-2";
import * as ChartJSZoomPlugin from "./utils/ChartJSZoomPlugin";
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

// Avoid loosing zoom
type State = {
    track?: boolean;
    min?: number;
    max?: number;
    width?: number;
}

const scales = [
    {value:"60000" , title:"1min"},
    {value:"120000", title:"2min"},
    {value:"180000", title:"3min"},
    {value:"300000", title:"5min"},
    {value:"600000", title:"10min"},
    {value:"900000", title:"15min"},
    {value:"1800000", title:"30min"},
];

// Afficher l'état de phd et permet de le controller
class PhdView extends React.PureComponent<Props, State> {
    pendingTimeout: NodeJS.Timeout|null;

    constructor(props:Props) {
        super(props);
        this.state = {}
        this.pendingTimeout = null;
    }

    startGuide = async ()=> {
        await BackendRequest.RootInvoker("phd")("startGuide")(CancellationToken.CONTINUE, {});
    }

    stopGuide = async ()=>{
        await BackendRequest.RootInvoker("phd")("stopGuide")(CancellationToken.CONTINUE, {});
    }

    handlePan = ({chart}:any)=> {
        console.log('handlePan');
        this.handleZoom({chart});
    }

    updateZoom = (e:React.ChangeEvent<HTMLSelectElement>) => {
        const v = e.target.value;
        if (this.pendingTimeout !== null) {
            clearTimeout(this.pendingTimeout);
            this.pendingTimeout = null;
        }
        if (v === 'full') {
            this.setState({});
        } else if (v !== '') {
            this.setState({
                track: true,
                width: parseFloat(v),
            });
        }
    }

    getCurrentZoom() {
        if (this.state.track === false) {
            return "";
        }
        if (this.state.track === undefined) {
            return "full";
        }
        for(const scale of scales) {
            if (parseFloat(scale.value) === this.state.width) {
                return scale.value;
            }
        }
        return "";
    }

    handleZoom = ({chart}: any)=>{
        const newMin:number = chart.scales['time'].min;
        const newMax:number = chart.scales['time'].max;
        if (this.pendingTimeout !== null) {
            clearTimeout(this.pendingTimeout);
            this.pendingTimeout = null;
        }
        this.pendingTimeout = setTimeout(()=> {
            const {minMoment, maxMoment} = this.getTimeRange();;


            console.log('current min, max',  minMoment, maxMoment, maxMoment! - minMoment!);
            console.log('zoomed  min, max',  newMin, newMax, newMax - newMin);
            if (newMax === newMin) {
                this.setState({
                    track: undefined,
                    width: undefined,
                    min: undefined,
                    max: undefined,
                })
            } else {
                if (newMax >= maxMoment!) {
                    this.setState({
                        track: true,
                        width: newMax - newMin,
                    });
                } else {
                    this.setState({
                        track: false,
                        min: chart.scales['time'].min,
                        max: chart.scales['time'].max,
                    });
                }

            }
        }, 20);
    }

    getTimeRange = ():{minMoment:number|undefined, maxMoment:number|undefined}=>{
        const bs = this.props.phd;
        if (!bs) {
            return {minMoment: undefined, maxMoment:undefined};
        }
        const rawDatas = bs.guideSteps;
        let minMoment: number|undefined;
        let maxMoment: number|undefined;
        for (const k of Object.keys(rawDatas)) {
            const entry = rawDatas[k];
            
            const ts = entry.Timestamp! * 1000;
            if (minMoment === undefined || minMoment > ts) {
                minMoment = ts;
            }
            if (maxMoment === undefined || maxMoment < ts) {
                maxMoment = ts;
            }
        }

        return {minMoment, maxMoment};
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
            datasets: [],
            labels: [],
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

        const {minMoment, maxMoment}=this.getTimeRange();
        const timerange = {
            min: minMoment,
            max: maxMoment,
        }
        if (maxMoment !== undefined && minMoment !== undefined) {
            if (this.state.track !== undefined) {
                if (this.state.track) {
                    timerange.min = maxMoment! - this.state.width!;
                    timerange.max = maxMoment!;
                } else {
                    timerange.min = this.state.min!;
                    timerange.max = this.state.max!;
                    if (timerange.min < minMoment) {
                        const move = minMoment - timerange.min;
                        timerange.min += move;
                        timerange.max += move;
                    }
                    if (timerange.max > maxMoment) {
                        timerange.max = maxMoment;
                    }
                }
            }
            // Every minute
            let nrOfTile = (timerange.max! - timerange.min!) / 60000;
            let interval = 1;
            let scales = [1, 2, 5, 10, 15, 30, 60, 2*60, 3*60, 6*60, 24*60];
            let rounds =  [1, 1, 1, 10, 10, 10, 60, 60,   60,   3*60, 24*60];
            let scaleId = 0;
            while(nrOfTile / scales[scaleId] > 4 && scaleId < scales.length) {
                scaleId++;
            }
            interval = scales[scaleId] * 60000;
            let round = rounds[scaleId] * 60000;
            
            while(nrOfTile / interval > 4 && interval < 365*86400*1000) {
                interval *= 2;
                round *= 2;
            }

            let s = minMoment + (minMoment % round ? round - minMoment % round : 0);
            while (s < minMoment + (maxMoment - minMoment) * 0.75) {
                chartData.labels!.push(s as any);
                s += interval;
            }
        }


        for(var propDef of props) {
            var prop = propDef.prop;

            var data:chartjs.ChartDataSets = {
                label: prop,
                borderWidth: 1.5,
                borderColor: propDef.color,
                lineTension: 0,
                pointRadius: 1.0,
                cubicInterpolationMode: undefined,
                showLine: true,
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
                    
                    var ts = entry.Timestamp * 1000;
                    if (ts < timerange.min!) continue;
                    if (ts > timerange.max!) continue;

                    const value:number|null = prop in entry ? flipFlop ? (entry[prop]?1:0) : entry[prop] : null;
                    if (flipFlop) {
                        if ((previous !== undefined) && (previous === value)) {
                            continue;
                        }
                        data.data!.push({x:ts!, y:previous || 0} as any);
                        previous = value;
                    }
                    data.data!.push({x:ts!, y:value} as any);
                }
                if (flipFlop && previous !== undefined && previous !== null && previous > 0) {
                    // Close
                    data.data!.push({x:maxMoment, y:1} as any);
                    data.data!.push({x:maxMoment, y:0} as any);
                }
            }
            chartData.datasets!.push(data);
        }

        const chartOptions: chartjs.ChartOptions = {
            // responsive: true,
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
                        maxRotation: 0,
                        source: 'labels',
                    },
                    time: {
                        // parser: moment.unix,
                        unit: 'minute',
                        ...timerange as any,
                    }
                }]
            },
            animation: {
                duration: 0 // general animation time
            },

            maintainAspectRatio: false,
            plugins: {
                zoom: {
                    pan: {
                        enabled: true,
                        mode: 'x',
                        onPan: this.handlePan,
                    },
                    // Container for zoom options
                    zoom: {
                        // Boolean to enable zooming
                        enabled: true,
            
                        // Enable drag-to-zoom behavior
                        drag: false,
            
                        // Drag-to-zoom rectangle style can be customized
                        // drag: {
                        // 	 borderColor: 'rgba(225,225,225,0.3)'
                        // 	 borderWidth: 5,
                        // 	 backgroundColor: 'rgb(225,225,225)'
                        // },
            
                        // Zooming directions. Remove the appropriate direction to disable
                        // Eg. 'y' would only allow zooming in the y direction
                        mode: 'x',
            
                        // Speed of zoom via mouse wheel
                        // (percentage of zoom on a wheel event)
                        speed: 0.1,
            
                        // Function called once zooming is completed
                        // Useful for dynamic data loading
                        onZoom: this.handleZoom,
                    }
                }
            }
        };

        const currentZoom = this.getCurrentZoom();
        return (
            <div className="Page">
                <div className={'PHDAppState PHDAppState_' + bs.AppState}>{bs.AppState}
                </div>
                <div>SNR:{bs.star != null ? bs.star.SNR : null}
                </div>
                <div className="PhdGraph_Item">
                    <div className="PhdGraph_Container">
                        <ReactChartJS.Line  data={chartData} options={chartOptions} plugins={ChartJSZoomPlugin.plugins()}/>
                    </div>
                    <select value={currentZoom} onChange={this.updateZoom} className="PhdRangeSelector">
                        {scales.map(e=> <option key={e.value} value={e.value}>{e.title}</option>)}
                        <option value="full">full</option>
                        {currentZoom === ''
                            ? <option value="">custom</option>
                            : null }
                    </select>
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