import React, { Component, PureComponent} from 'react';
import { Line } from 'react-chartjs-2';

import PropTypes from 'prop-types';
import { notifier, BackendStatus } from './Store';
import { connect } from 'react-redux';
import JsonPath from './shared/JsonPath';
import PromiseSelector from './PromiseSelector';
import CameraSettingsView from './CameraSettingsView';
import DeviceConnectBton from './DeviceConnectBton';
import './CameraView.css'
import BackendAccessor from './utils/BackendAccessor';
import FocuserSettingsView from './FocuserSettingsView';
import ScrollableText from './ScrollableText';

import './FocuserView.css';

class FocuserBackendAccessor extends BackendAccessor {
    apply(jsonDiff) {
        console.log('Sending changes: ' , jsonDiff);
        return notifier.sendRequest({'target': 'focuser', 
            method: 'updateCurrentSettings',
            diff: jsonDiff
        }).start();
    }
}

class FocuserGraph extends PureComponent {

    render() {
        var chartData= {
            datasets: []
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
                data: []
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
                        callback: e=>(typeof(e) == 'number') ? e.toFixed(1) : e
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

    static mapStateToProps(store) {
        var result = {
            firstStep: store.backend.focuser.current.firstStep,
            lastStep: store.backend.focuser.current.lastStep,
            points: store.backend.focuser.current.points,
            predicted: store.backend.focuser.current.predicted
        };
        return result;
    }
}

FocuserGraph = connect(FocuserGraph.mapStateToProps)(FocuserGraph);

class FocuserView extends PureComponent {
    constructor(props) {
        super(props);
        this.start = this.start.bind(this);
        this.stop = this.stop.bind(this);
    }

    start() {
        this.props.app.serverRequest({
            method: 'focus'
        }).start();
    }

    stop() {
        this.props.app.serverRequest({
            method: 'abort'
        }).start();
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

    static mapStateToProps(store) {
        return {
            status: store.backend.focuser.current.status,
            error: store.backend.focuser.current.error
        }
    }
}


export default connect(FocuserView.mapStateToProps)(FocuserView);