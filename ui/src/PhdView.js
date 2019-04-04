/**
 * Created by ludovic on 18/07/17.
 */
import React, { Component } from 'react';
import { connect } from 'react-redux';

import { Line } from 'react-chartjs-2';
import moment from 'moment';

import './PhdView.css';

const StatusForGuiding = ["Paused", "Looping", "Stopped", "LostLock" ];


// Afficher l'état de phd et permet de le controller
class PhdView extends Component {
    constructor(props) {
        super(props);
        this.phdRequest = this.phdRequest.bind(this);

    }

    phdRequest(method) {
        var self = this;
        return function() {
            self.props.app.serverRequest({
                method: method
            }).start();
        }
    }

    render() {
        var bs = this.props.phd;
        if (bs == undefined || bs == null) {
            return null;
        }

        function formatNumber(n)
        {
            if (n == undefined || n == null) return n;
            if (typeof(n) == 'number') {
                return n.toFixed(2);
            }
            return "?" + n;
        }

        var chartData= {
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

        var minMoment, maxMoment;

        for(var propDef of props) {
            var prop = propDef.prop;

            var data = {
                label: prop,
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

            var rawDatas = this.props.phd.guideSteps;
            var flipFlop = propDef.flipFlop;
            var previous = undefined;
            if (rawDatas) {
                var keys = Array.from(Object.keys(rawDatas)).sort();
                var prev = undefined;
                for (var i =0; i < keys.length; ++i) {
                    var uid = keys[i];
                    var entry = rawDatas[uid];
                    
                    var ts = entry.Timestamp;
                    if (minMoment == undefined) {
                        minMoment = ts;
                        maxMoment = ts;
                    } else {
                        maxMoment = ts;
                    }

                    var value = prop in entry ? entry[prop] : null;
                    if (flipFlop) {
                        if ((previous !== undefined) && (previous === value)) {
                            continue;
                        }
                        data.data.push({x:ts, y:previous});
                        previous = value;
                    }
                    data.data.push({x:ts, y:value});
                }
            }
            chartData.datasets.push(data);
        }

        var chartOptions= {

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
                        round: false,
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
                <div className={'PHDAppState PHDAppState_' + this.props.phd.AppState}>{this.props.phd.AppState}
                </div>
                <div>SNR:{this.props.phd.star != null ? this.props.phd.star.SNR : null}</div>
                <div className="PhdGraph_Item">
                    <div className="PhdGraph_Container">
                        <Line data={chartData} options={chartOptions} />
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
                                <td>{formatNumber(this.props.phd.RADistanceRMS)}</td>
                                <td>{formatNumber(this.props.phd.RADistancePeak)}</td>
                            </tr>
                            <tr>
                                <td>DEC</td>
                                <td>{formatNumber(this.props.phd.DECDistanceRMS)}</td>
                                <td>{formatNumber(this.props.phd.DECDistancePeak)}</td>
                            </tr>
                            <tr>
                                <td>Total</td>
                                <td>{formatNumber(this.props.phd.RADECDistanceRMS)}</td>
                                <td>{formatNumber(this.props.phd.RADECDistancePeak)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div className="ButtonBar">
                <input type="button" value="Guide" onClick={this.phdRequest('startGuide')}
                    disabled={StatusForGuiding.indexOf(bs.AppState) == -1}
                    />
                <input type="button" value="Stop" onClick={this.phdRequest('stopGuide')}
                    disabled={bs.AppState == "Stopped"}
                    />
                </div>
            </div>);
    }
}


const mapStateToProps = function(store) {
    var result = {
        phd: store.backend.phd
    };
    return result;
}

export default connect(mapStateToProps)(PhdView);