import * as React from 'react';
import CancellationToken from 'cancellationtoken';
import { Line } from 'react-chartjs-2';

import * as BackOfficeStatus from '@bo/BackOfficeStatus';
import * as Store from './Store';
import './CameraView.css'
import BackendAccessor from './utils/BackendAccessor';
import FocuserSettingsView from './FocuserSettingsView';
import ScrollableText from './ScrollableText';
import * as BackendRequest from "./BackendRequest";

import './FocuserView.css';

class FocuserBackendAccessor extends BackendAccessor<BackOfficeStatus.AutoFocusSettings> {
    // public apply = async (jsonDiff:any):Promise<void>=>{
    apply = async (jsonDiff:any)=>{
        console.log('Sending changes: ' , jsonDiff);
        await BackendRequest.RootInvoker("focuser")("updateCurrentSettings")(
            CancellationToken.CONTINUE,
            {diff: jsonDiff}
        );
    }
}

type FocuserGraphInputProps = {
}
type FocuserGraphMappedProps = {
    firstStep: BackOfficeStatus.AutoFocusStatus["firstStep"];
    lastStep: BackOfficeStatus.AutoFocusStatus["lastStep"];
    points: BackOfficeStatus.AutoFocusStatus["points"];
    predicted: BackOfficeStatus.AutoFocusStatus["predicted"];
    
}
type FocuserGraphProps = FocuserGraphInputProps & FocuserGraphMappedProps;

class UnmappedFocuserGraph extends React.PureComponent<FocuserGraphProps> {

    render() {
        var chartData= {
            datasets: [] as Array<any>
        };
        const propDefs = [
            {prop: 'fwhm', color:'#ff0000', source: this.props.points},
            {prop: 'fwhm', color:'#0000ff', source: this.props.predicted, hideEmpty: true, label:'prediction'}
        ];

        for(let propDef of propDefs)
        {
            let data = {
                label: propDef.prop,
                borderWidth: 1.5,
                borderColor: propDef.color,
                lineTension: 0,
                pointRadius: 1.0,
                cubicInterpolationMode: undefined,
                showLines: false,
                data: [] as Array<{x:number, y:number}>
            }
            for(var o of Object.keys(propDef)) {
                if ((o == "prop" || o == "color")) continue;
                data[o] = propDef[o];
            }
        
            var points = propDef.source;
            var previous = undefined;
            const steps = Object.keys(points);
            steps.sort((a, b) => parseFloat(a) - parseFloat(b));
            console.log('Steps ar :', steps);
            for(let step of steps)
            {
                const point = points[step];

                if (propDef.prop in point) {
                    var value = point[propDef.prop];
                    data.data.push({x: parseFloat(step), y:value});
                }
            }
            if (data.data.length || !propDef.hideEmpty) {
                chartData.datasets.push(data);
            }
        }

        var chartOptions= {
            scales: {
                yAxes: [
                {
                    id: 'default',
                    type: 'linear',
                    ticks: {
                        callback: (e:any)=>(typeof(e) == 'number') ? e.toFixed(1) : e
                    //     beginAtZero: false,
                    //     min: -1.0,
                    //     max: 1.0
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
                    id: 'step',
                    type: 'linear',
                    ticks: {
                        min: this.props.firstStep || 0,
                        max: this.props.lastStep || 0,
                        maxRotation: 0
                    },
                }]
            },
            animation: {
                duration: 0 // general animation time
            },

            maintainAspectRatio: false
        };
        return <Line data={chartData} options={chartOptions} />;
    }

    static mapStateToProps(store:Store.Content) {
        var result = {
            firstStep: store.backend.focuser!.current.firstStep,
            lastStep: store.backend.focuser!.current.lastStep,
            points: store.backend.focuser!.current.points,
            predicted: store.backend.focuser!.current.predicted
        };
        return result;
    }
}

const FocuserGraph = Store.Connect<UnmappedFocuserGraph, FocuserGraphInputProps, {}, FocuserGraphMappedProps>(UnmappedFocuserGraph);


type InputProps = {}
type MappedProps = {
    status: BackOfficeStatus.AutoFocusStatus["status"];
    error: BackOfficeStatus.AutoFocusStatus["error"];
}
type Props = InputProps & MappedProps;

class UnmappedFocuserView extends React.PureComponent<Props> {
    constructor(props: Props) {
        super(props);
    }

    start = async ()=>{
        return await BackendRequest.RootInvoker("focuser")("focus")(
            CancellationToken.CONTINUE,
            {
            }
        );
    }

    stop = async ()=>{
        return await BackendRequest.RootInvoker("focuser")("abort")(
            CancellationToken.CONTINUE,
            {
            }
        );
    }

    render() {
        return (
            <div className="Page">
                <ScrollableText className={'FocuserState FocuserState_' + this.props.status}>
                    {this.props.status === 'error' ? this.props.error : this.props.status}
                </ScrollableText>
                <FocuserSettingsView accessor={new FocuserBackendAccessor("$.focuser.currentSettings")}/>
                <div className="PhdGraph_Item">
                    <div className="PhdGraph_Container">
                        <FocuserGraph/>
                    </div>
                </div>
                <div className="ButtonBar">
                <input type="button" value="Focus" onClick={this.start}
                    // disabled={StatusForGuiding.indexOf(bs.AppState) == -1}
                    />
                <input type="button" value="Stop" onClick={this.stop}
                    // disabled={bs.AppState == "Stopped"}
                    />
                </div>
            </div>);
    }

    static mapStateToProps(store: Store.Content) {
        return {
            status: store.backend.focuser!.current.status,
            error: store.backend.focuser!.current.error
        }
    }
}


export default Store.Connect<UnmappedFocuserView, InputProps, {}, MappedProps>(UnmappedFocuserView);
