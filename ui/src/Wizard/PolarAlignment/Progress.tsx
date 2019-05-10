import React from 'react';
import CancellationToken from 'cancellationtoken';
import chartjs from "chart.js";
//@ts-ignore
require("chartjs-plugin-zoom");
import * as ReactChartJS from "react-chartjs-2";

import '../../AstrometryView.css';
import * as BackendRequest from "../../BackendRequest";
import * as Store from "../../Store";
import * as Utils from "../../Utils";
import { PolarAlignStatus } from '@bo/BackOfficeStatus';
import StatusLabel from '@src/Sequence/StatusLabel';

type InputProps = {};
type MappedProps = PolarAlignStatus & {
}
type Props = InputProps & MappedProps;

class Progress extends React.PureComponent<Props> {
    constructor(props:Props) {
        super(props);
    }

    getStatusClass = ()=> {
        if (this.props.fatalError !== null) {
            return "PolarAlignStatus_error";
        }
        return "PolarAlignStatus_" + this.props.status;
    }

    getStatusTitle = ()=> {
        if (this.props.fatalError !== null) {
            return "Failed: " + this.props.fatalError;
        }
        switch(this.props.status) {
            case "done":
                return "Success";
            case "paused":
                return "Paused";
            case "running":
                return "Running";
        }
        return "" + this.props.status;
    }

    render() {

        var chartData: ReactChartJS.ChartData<chartjs.ChartData>= {
            datasets: [],
            labels: [],
        };

        const data:chartjs.ChartDataSets = {
            label: 'dec/ra',
            borderWidth: 1.5,
            borderColor: '#00ff00',
            lineTension: 0,
            pointRadius: 1.0,
            cubicInterpolationMode: undefined,
            showLine: true,
            data: []
        }

        for(const k of Object.keys(this.props.data).sort()) {
            const point = this.props.data[k];
            data.data!.push({x:point.relRaDeg, y:point.dec} as any);
        }
        chartData.datasets!.push(data);

        const chartOptions: chartjs.ChartOptions = {
            // responsive: true,
            scales: {
                yAxes: [
                {
                    id: 'default',
                    type: 'linear',
                    ticks: {
                        maxRotation: 0,
                    }
                }
                ],
                xAxes: [{
                    id: 'ra',
                    type: 'linear',
                    ticks: {
                        maxRotation: 0,
                    },
                }]
            },
            animation: {
                duration: 0 // general animation time
            },

            maintainAspectRatio: false,
        };


        return <>
            <div className="Wizard_subtitle">
                Sampling mount axis
            </div>
            <div className={"PolarAlignStatus " + this.getStatusClass()}>
                <StatusLabel className="" text={this.getStatusTitle()}/>
            </div>
            <div>
                Step: {this.props.stepId + 1} / {this.props.maxStepId + 1}<br/>
            </div>
            <div>
                Scope:&nbsp;
                {this.props.scopeMoving ? "Moving" : null}
                {this.props.shootRunning ? "Exposing" : null}
                {!(this.props.scopeMoving || this.props.shootRunning) ? "Idle" : null}
            </div>

            <div>
                Astrometry:&nbsp;
                    {!((this.props.astrometrySuccess + this.props.astrometryFailed) || this.props.astrometryRunning)
                        ? " Idle"
                        : null
                    }
                    {this.props.astrometryRunning ? " Running" : null}
                    {this.props.astrometrySuccess > 0 ? " " + this.props.astrometrySuccess + " OK" : null}
                    {this.props.astrometryFailed > 0 ? " " + this.props.astrometryFailed + " Failed" : null}
            </div>
            <div >
                {data.data!.length > 0
                    ? <ReactChartJS.Line  data={chartData} options={chartOptions} />
                    : null
                }
            </div>
        </>
    }

    static mapStateToProps(store: Store.Content, props: InputProps):MappedProps {
        const polarAlignment:MappedProps = Utils.noErr(()=>store.backend.astrometry!.runningWizard!.polarAlignment!, undefined) ||
                {
                    astrometryFailed: 0,
                    astrometryRunning: false,
                    astrometrySuccess: 0,
                    data: {},
                    maxStepId: 0,
                    scopeMoving: false,
                    shootDone: 0,
                    shootRunning: false,
                    status: "paused",
                    stepId: 0,
                    adjustError: null,
                    adjusting: null,
                    hasRefFrame: false,
                    fatalError: "Wizard not ready",
                    adjustPositionError: null,
                    adjustPositionWarning: null,
                }
        return polarAlignment;
    }
}

export default Store.Connect(Progress);