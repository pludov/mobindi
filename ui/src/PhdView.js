/**
 * Created by ludovic on 18/07/17.
 */
import React, { Component } from 'react';
import { connect } from 'react-redux';

import { notifier, BackendStatus } from './Store';

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
        return function() {
            notifier.sendMessage({
                target: 'phd',
                method: method
            });
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
        const props = [{prop: 'RADistanceRaw', color:'#ff0000'}, {prop:'DECDistanceRaw', color:'#0000ff'}];

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
            var rawDatas = this.props.phd.guideSteps;

            if (rawDatas) {
                var keys = Array.from(Object.keys(rawDatas)).sort();
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

                    if (prop in entry) {
                        data.data.push({x:ts, y:entry[prop]});
                    } else {
                        data.data.push({x:ts, y:null});
                    }
                }
            }
            chartData.datasets.push(data);
        }

        var chartOptions= {

            scales: {
                yAxes: [{
                    type: 'linear',
                    ticks: {
                        beginAtZero: true,
                        min: -1.0,
                        max: 1.0
                    }
                }],
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

// FIXME: ça sert à quoi ?
const mapDispatchToProps = (dispatch) => {
    return {
        UpdateSearch: (value) => {
            dispatch({type: 'UpdateSearch', value: value});
        }
    };
}

export default connect(mapStateToProps, mapDispatchToProps)(PhdView);