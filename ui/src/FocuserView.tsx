import * as React from 'react';
import { connect } from 'react-redux';
import CancellationToken from 'cancellationtoken';
import { Line } from 'react-chartjs-2';

import Log from './shared/Log';
import * as BackOfficeStatus from '@bo/BackOfficeStatus';
import * as Help from './Help';
import * as Store from './Store';
import * as IndiManagerStore from './IndiManagerStore';
import './CameraView.css'
import * as AccessPath from './utils/AccessPath';
import { RecursiveBackendAccessor, BackendAccessorImpl, BackendAccessor } from './utils/BackendAccessor';
import FocuserSettingsView from './FocuserSettingsView';
import ScrollableText from './ScrollableText';
import * as BackendRequest from "./BackendRequest";

import './FocuserView.css';
import Panel from './Panel';
import EditableImagingSetupSelector from './EditableImagingSetupSelector';
import CameraSettingsPanel from './CameraSettingsPanel';
import ImagingSetupSelector from './ImagingSetupSelector';
import FilterWheelSettingsPanel from './FilterWheelSettingsPanel';
import { defaultMemoize } from 'reselect';
import CameraDeviceSettingsBackendAccessor from './CameraDeviceSettingBackendAccessor';

const logger = Log.logger(__filename);

class FocuserBackendAccessor extends BackendAccessorImpl<BackOfficeStatus.FocuserSettings> {
    // public apply = async (jsonDiff:any):Promise<void>=>{
    apply = async (jsonDiff:any)=>{
        logger.debug('Sending changes' , {jsonDiff});
        await BackendRequest.RootInvoker("focuser")("updateCurrentSettings")(
            CancellationToken.CONTINUE,
            {diff: jsonDiff}
        );
    }
}

type FocuserGraphInputProps = {
    focuser: string | null;
}

type FocuserGraphMappedProps = {
    firstStep: BackOfficeStatus.AutoFocusStatus["firstStep"];
    lastStep: BackOfficeStatus.AutoFocusStatus["lastStep"];
    points: BackOfficeStatus.AutoFocusStatus["points"];
    predicted: BackOfficeStatus.AutoFocusStatus["predicted"];
    currentPosition: number|null;
    currentMoving: boolean;
}
type FocuserGraphProps = FocuserGraphInputProps & FocuserGraphMappedProps;

class UnmappedFocuserGraph extends React.PureComponent<FocuserGraphProps> {

    render() {
        var chartData= {
            datasets: [] as Array<any>
        };
        const propDefs = [
            {prop: 'fwhm', color:'#ff0000', source: this.props.points},
            {prop: 'fwhm', color:'#0000ff', source: this.props.predicted, hideEmpty: true, label:'prediction'},
            {prop: 'x', color: '#808080',
                    yAxisID: 'currentPos',
                    backgroundColor: this.props.currentMoving ? 'rgb(250,210,0)' : 'rgb(110,190,1)',
                    borderColor: this.props.currentMoving ? 'rgb(250,210,0)' : 'rgb(110,190,1)',
                    borderWidth: 2,
                    pointRadius: 2,
                    fill: true,
                    stepped: false,
                    label: this.props.currentMoving ? 'Focuser (moving)' : 'Focuser',
                    range: true,
                    source: this.props.currentPosition !== null
                        ? {[this.props.currentPosition]: {x:1}} : {},
            }
        ];

        for(let propDef of propDefs)
        {
            const range = propDef.range;

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
            let previousX:number|undefined = undefined;
            const steps = Object.keys(points);
            steps.sort((a, b) => parseFloat(a) - parseFloat(b));
            logger.debug('Steps ar :', {steps});
            for(let step of steps)
            {
                const point = points[step];

                if (propDef.prop in point) {
                    const x = parseFloat(step);
                    const value = point[propDef.prop];
                    if (range) {
                        if (previousX === undefined) {
                            data.data!.push({x:x, y:0} as any);
                        }
                        previousX = x;
                    }
                    data.data.push({x: x, y:value});
                }
            }
            if (range && previousX !== undefined) {
                // Close
                data.data!.push({x:previousX, y:0} as any);
            }
            if (data.data.length || !propDef.hideEmpty) {
                chartData.datasets.push(data);
            }
        }


        let min = this.props.firstStep;
        let max = this.props.lastStep;
        if (max !== null && min !== null && max < min) {
            const t = max;
            max = min;
            min = t;
        }

        if (this.props.currentPosition !== null) {
            if (min === null || max === null) {
                min = Math.max(this.roundBefore(this.props.currentPosition - 100, 100), 0);
                max = this.props.currentPosition + 100;
            } else if (this.props.currentPosition < min) {
                const granularity = this.getGranularity(max - min);
                min = Math.max(this.roundBefore(this.props.currentPosition - granularity, granularity), 0);
            } else if (this.props.currentPosition > max) {
                const granularity = this.getGranularity(max - min);
                max = this.roundAfter(this.props.currentPosition + granularity, granularity);
            }
        }
        if (min === null) {
            min = 0;
        }
        if (max === null) {
            max = min + 100;
        }

        var chartOptions= {
            scales: {
                yAxes: [
                {
                    id: 'default',
                    type: 'linear',
                    ticks: {
                        callback: (e:any)=>(typeof(e) == 'number') ? e.toFixed(1) : e,
                        beginAtZero: true,
                    //     min: -1.0,
                    //     max: 1.0
                    }
                },
                {
                    id: 'currentPos',
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
                        min: min,
                        max: max,
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

    getGranularity(level:number) {
        level = Math.abs(level);
        if (level <= 1) {
            return level;
        }
        return Math.pow(10, Math.floor(Math.log10(level)));
    }

    roundBefore(value: number, granularity : number)
    {
        return granularity * Math.floor(value / granularity)
    }

    roundAfter(value: number, granularity : number)
    {
        return granularity * Math.ceil(value / granularity)
    }

    static mapStateToProps(store:Store.Content, ownProps: FocuserGraphInputProps) {
        // Get property for focuser position
        let currentPositionStr =
            ownProps.focuser === null
                ? null
                : IndiManagerStore.getProperty(store, ownProps.focuser, 'ABS_FOCUS_POSITION', 'FOCUS_ABSOLUTE_POSITION');
        let currentPosition =
            currentPositionStr === null
                ? null
                : parseInt(currentPositionStr);
        if (currentPosition !== null && isNaN(currentPosition)) {
            currentPosition = null;
        }

        let currentMoving: boolean = false;
        if (currentPosition !== null) {
            const vec = IndiManagerStore.getVector(store, ownProps.focuser!, 'ABS_FOCUS_POSITION');
            currentMoving = vec !== null && vec.$state === "Busy";
        }

        var result = {
            firstStep: store.backend.focuser!.current.firstStep,
            lastStep: store.backend.focuser!.current.lastStep,
            points: store.backend.focuser!.current.points,
            predicted: store.backend.focuser!.current.predicted,
            currentPosition,
            currentMoving,
        };
        return result;
    }
}

const FocuserGraph = Store.Connect<UnmappedFocuserGraph, FocuserGraphInputProps, {}, FocuserGraphMappedProps>(UnmappedFocuserGraph);


type InputProps = {
    imagingSetupIdAccessor: Store.Accessor<string|null>;
}
type MappedProps = {
    imagingSetup: string|null;
    camera: string|null;
    focuser: string|null;
    status: BackOfficeStatus.AutoFocusStatus["status"];
    error: BackOfficeStatus.AutoFocusStatus["error"];
}
type Props = InputProps & MappedProps;

class UnmappedFocuserView extends React.PureComponent<Props> {
    static focusBtonHelp = Help.key("Start auto-focus", "Start a sequence of focus image, scanning a range of focuser positions, then use the best one found (best FHWM)");
    static stopBtonHelp = Help.key("Stop auto-focus", "Abort the current running auto-focus");

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

    setCurrentImagingSetup = async(id:string)=> {
        return await BackendRequest.RootInvoker("focuser")("setCurrentImagingSetup")(
            CancellationToken.CONTINUE,
            {
                imagingSetup: id
            }
        );
    };

    render() {
        return (
            <div className="Page">
                <div className="AstrometryWizardContent">
                    <div className="AstrometryWizardSelectTitle">Focus</div>
                    <ScrollableText className={'FocuserState FocuserState_' + this.props.status}>
                        {this.props.status === 'error' ? this.props.error : this.props.status}
                    </ScrollableText>
                    <div className="PhdGraph_Item FocuserGraph">
                        <div className="PhdGraph_Container">
                            <FocuserGraph focuser={this.props.focuser}/>
                        </div>
                    </div>

                    <Panel guid="astrom:polaralign:camera">
                        <span>Settings</span>
                    
                        <div>
                            <EditableImagingSetupSelector accessor={this.props.imagingSetupIdAccessor}/>
                        </div>
                        <CameraSettingsPanel imagingSetup={this.props.imagingSetup}/>
                        <FilterWheelSettingsPanel imagingSetup={this.props.imagingSetup}/>

                        {this.props.focuser !== null
                            ? <FocuserSettingsView accessor={new FocuserBackendAccessor(AccessPath.For((e)=>e.imagingSetup!.configuration.byuuid[this.props.imagingSetup!].focuserSettings))}/>
                            : null
                        }
                    </Panel>
                </div>

                <div className="AstrometryWizardControls">
                    <input type="button" value="Stop" onClick={this.stop}
                        className="WizardLeftButton"
                        disabled={this.props.status !== "running"}
                        {...UnmappedFocuserView.stopBtonHelp.dom()}
                        />
                    <input type="button" value="Focus" onClick={this.start}
                        className="WizardRightButton"
                        disabled={this.props.focuser === null || this.props.camera === null || this.props.status === "running"}
                        {...UnmappedFocuserView.focusBtonHelp.dom()}
                        />
                </div>
            </div>);
    }

    static mapStateToProps=()=> {

        return (store: Store.Content, ownProps: Props) => {
            let imagingSetup = ownProps.imagingSetupIdAccessor.fromStore(store);

            const imagingSetupConfig = ImagingSetupSelector.getImagingSetup(store, imagingSetup);
            let camera = imagingSetupConfig?.cameraDevice;
            if (camera === undefined) camera = null;

            let focuser = imagingSetupConfig?.focuserDevice;

            if (focuser === undefined) {
                focuser = null;
            }

            return {
                imagingSetup,
                camera,
                focuser,
                status: store.backend.focuser?.current.status || "error",
                error: store.backend.focuser?.current.error || null
            }
        }
    }
}


export default Store.Connect<UnmappedFocuserView, InputProps, {}, MappedProps>(UnmappedFocuserView);
