import * as React from 'react';
import { connect } from 'react-redux';
import CancellationToken from 'cancellationtoken';
import { Line } from 'react-chartjs-2';

import * as BackOfficeStatus from '@bo/BackOfficeStatus';
import * as Store from './Store';
import * as Utils from './Utils';
import PromiseSelector from './PromiseSelector';
import './CameraView.css'
import CameraSettingsView from './CameraSettingsView';
import DeviceConnectBton from './DeviceConnectBton';
import BackendAccessor from './utils/BackendAccessor';
import FocuserSettingsView from './FocuserSettingsView';
import ScrollableText from './ScrollableText';
import * as BackendRequest from "./BackendRequest";

import './FocuserView.css';
import Panel from './Panel';

class FocuserBackendAccessor extends BackendAccessor<BackOfficeStatus.FocuserSettings> {
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
    camera: string|null;
    focuser: string|null;
    status: BackOfficeStatus.AutoFocusStatus["status"];
    error: BackOfficeStatus.AutoFocusStatus["error"];
}
type Props = InputProps & MappedProps;

const CameraSelector = connect((store:Store.Content)=> ({
    active: store.backend && store.backend.focuser ? store.backend.focuser.selectedCamera : undefined,
    availables: store.backend && store.backend.camera ? store.backend.camera.availableDevices : []
}))(PromiseSelector);

const FocuserSelector = connect((store:Store.Content)=> {
    const camera = store.backend && store.backend.focuser ? store.backend.focuser.selectedCamera : undefined;

    return {
        active: camera === null || camera === undefined ? null:
                store.backend && store.backend.camera && Utils.has(store.backend.camera.dynStateByDevices, camera)
                     ? store.backend.camera.dynStateByDevices[camera].focuserDevice : null,
        availables: store.backend && store.backend.focuser ? store.backend.focuser.availableFocusers : []
    };
})(PromiseSelector);


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

    setCamera = async(id:string)=> {
        return await BackendRequest.RootInvoker("focuser")("setCurrentCamera")(
            CancellationToken.CONTINUE,
            {
                cameraDevice: id
            }
        );
    };

    setFocuser = async(id:string)=> {
        if (this.props.camera === null) {
            throw new Error("no camera selected");
        }
        return await BackendRequest.RootInvoker("focuser")("setCurrentFocuser")(
            CancellationToken.CONTINUE,
            {
                cameraDevice: this.props.camera,
                focuserDevice: id,
            }
        );
    };

    cameraSettingSetter = (propName:string):((v:any)=>Promise<void>)=>{
        return async (v:any)=> {
            if (this.props.camera === null) {
                throw new Error("No camera selected");
            }
            await BackendRequest.RootInvoker("camera")("setShootParam")(
                CancellationToken.CONTINUE,
                {
                    camera: this.props.camera,
                    key: propName as any,
                    value: v
                }
            );
        }
    }

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
                            <FocuserGraph/>
                        </div>
                    </div>

                    <Panel guid="astrom:polaralign:camera">
                        <span>Settings</span>
                    
                        <div>
                            <CameraSelector setValue={this.setCamera}/>
                            <DeviceConnectBton
                                    activePath="$.backend.focuser.selectedCamera"/>
                        </div>
                        <CameraSettingsView
                            settingsPath={"$.backend.camera.configuration.deviceSettings"}
                            activePath="$.backend.focuser.selectedCamera"
                            setValue={this.cameraSettingSetter}
                        />

                        {this.props.camera !== null
                            ?
                            <div>
                                <FocuserSelector setValue={this.setFocuser}/>
                                <DeviceConnectBton
                                    activePath={"$.backend.camera.dynStateByDevices[" + JSON.stringify(this.props.camera) + "].focuserDevice"}/>
                            </div>
                            :
                            null
                        }
                        {this.props.focuser !== null
                            ? <FocuserSettingsView accessor={new FocuserBackendAccessor("$.focuser.config.settings[" + JSON.stringify(this.props.focuser) + "]")}/>
                            : null
                        }
                    </Panel>
                </div>

                <div className="AstrometryWizardControls">
                    <input type="button" value="Stop" onClick={this.stop}
                        className="WizardLeftButton"
                        disabled={this.props.status !== "running"}
                        />
                    <input type="button" value="Focus" onClick={this.start}
                        className="WizardRightButton"
                        disabled={this.props.focuser === null || this.props.camera === null || this.props.status === "running"}
                        />
                </div>
            </div>);
    }

    static mapStateToProps(store: Store.Content) {
        const camera = store.backend.focuser!.selectedCamera;
        let focuser = Utils.noErr(()=>{
            if (camera === null) {
                return null;
            }
            const d = store.backend.camera!.dynStateByDevices;
            if (!Utils.has(d, camera)) {
                return null;
            }
            return d[camera!].focuserDevice
        }, null);

        if (focuser === undefined) {
            focuser = null;
        }

        return {
            camera,
            focuser,
            status: store.backend.focuser!.current.status,
            error: store.backend.focuser!.current.error
        }
    }
}


export default Store.Connect<UnmappedFocuserView, InputProps, {}, MappedProps>(UnmappedFocuserView);
