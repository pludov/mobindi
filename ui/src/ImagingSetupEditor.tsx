import * as React from 'react';

import * as Utils from "./Utils";

import * as Help from "./Help";
import * as BackendRequest from "./BackendRequest";
import * as AccessPath from './shared/AccessPath';
import * as Store from "./Store";
import * as ImagingSetupStore from "./ImagingSetupStore";
import * as FocuserStore from "./FocuserStore";
import CancellationToken from 'cancellationtoken';

import TextEdit from './TextEdit';
import PromiseSelector, { Props as PromiseSelectorProps }  from './PromiseSelector';

import { connect } from 'react-redux';
import { createSelector, defaultMemoize } from 'reselect'
import { FocuserSettings, ImagingSetup } from '@bo/BackOfficeStatus';
import IndiFilterWheelFocusAdjusterConfig from './IndiFilterWheelFocusAdjusterConfig';
import IndiPropertyIdentifierSelector from './indiview/IndiPropertyIdentifierSelector';
import Bool from './primitives/Bool';

const namePropertyHelp = Help.key("Name", "Give a name to this imaging setup. Will use camera name by default");
const cameraSelectorHelp = Help.key("Camera", "Select the main camera for this imaging setup");
const filterWheelSelectorHelp = Help.key("Filter wheel", "Select the filter wheel for this imaging setup");
const focuserSelectorHelp = Help.key("Focuser", "Select the focuser for this imaging setup");

const temperaturePropertySelectorHelp = Help.key("Select temperature source", "Select a INDI property that will be used for temperature compensation at the focuser");
const focusStepPerDegreeHelp = Help.key("Temperature compensation (step per °C)", "Number of step to move the focuser per degree (°C) change. Use negative if step are counter backward (lower = further from objective).");
const focusStepToleranceHelp = Help.key("Minimal adjustment (step)", "Avoid moving focuser for delta under this thresold");
const focuserInterruptGuidingHelp = Help.key("Focuser affects guiding", "When enabled, PHD guiding gets paused during planned focuser move");

type IndiDeviceListItem = {
    id: string;
    title: string;
}

function getAvailableDevices(rawAvailable:(store: Store.Content)=>string[]|undefined) {
    return () => {
        const availableSelector = createSelector(
            [rawAvailable, (store:Store.Content, props:PromiseSelectorProps<IndiDeviceListItem>)=>props.active],
            (availables:string[]|undefined, active: string|null)=> {
                if (availables === undefined) {
                    availables = [];
                }
                const ret = availables.map((id:string)=>({id, title: id}));

                if (active !== null && availables.indexOf(active) === -1) {
                    ret.push({
                        id: active,
                        title: active + " (missing)",
                    });
                }
                return ret;
            }
        );
        return (store:Store.Content, ownProps: PromiseSelectorProps<IndiDeviceListItem>)=> ({
            availables: availableSelector(store, ownProps),
            getId: (i:IndiDeviceListItem)=>i.id,
            getTitle: (i:IndiDeviceListItem)=>i.title,
        });
    }
}

const CameraSelector = connect(getAvailableDevices((store: Store.Content)=>store.backend?.indiManager?.availableCameras))(PromiseSelector);
const FilterWheelSelector = connect(getAvailableDevices((store: Store.Content)=>store.backend?.indiManager?.availableFilterWheels))(PromiseSelector);
const FocuserSelector = connect(getAvailableDevices((store: Store.Content)=>store.backend?.indiManager?.availableFocusers))(PromiseSelector);

type InputProps = {
    imagingSetupUid: string;
}

type MappedProps = {
    visible:boolean;
    name: string;
    cameraDevice: ImagingSetup["cameraDevice"];
    filterWheelDevice: ImagingSetup["filterWheelDevice"];
    focuserDevice:ImagingSetup["focuserDevice"];
    hasFocuserTemperatureReferenceProperty: boolean;
    focusStepPerDegree: number|null;
    focusStepTolerance: number;
}

type Props = InputProps & MappedProps;


type State = {
    busy: number;
}

class ImagingSetupEditor extends React.PureComponent<Props, State> {

    constructor(props: Props) {
        super(props);
        this.state = {busy: 0};
    }

    updateName=async (name:string)=> {
        await BackendRequest.RootInvoker("imagingSetupManager")("setName")(
            CancellationToken.CONTINUE,
            {
                imagingSetupUuid: this.props.imagingSetupUid,
                name
            }
        );
    }

    setDevice = (device:"cameraDevice"|"focuserDevice"|"filterWheelDevice") => {
        return async(value:null | string)=>{
            await BackendRequest.RootInvoker("imagingSetupManager")("setDevice")(
                CancellationToken.CONTINUE,
                {
                    imagingSetupUuid: this.props.imagingSetupUid,
                    device,
                    value
                }
            );
        }
    }

    updateSetting=async(setting: keyof FocuserSettings, e: string) => {
        try {
            this.setState((s)=>{busy: s.busy+1});

            let value = e.trim() ? parseFloat(e.trim()) : null;

            if (value === null || !isNaN(value)) {
                await FocuserStore.focuserSettingsAccessor(this.props.imagingSetupUid).prop(setting).send(value);
            }
        } finally {
            this.setState((s)=>{busy: s.busy-1});
        }

    }

    updateFocusStepPerDegree=async (e:string) => {
        return await this.updateSetting("focusStepPerDegree", e);
    }

    updateFocusStepTolerance=async(e:string)=> {
        if (!e.trim()) {
            throw new Error("Invalid empty value");
        }
        return await this.updateSetting("focusStepTolerance", e);
    }

    setCamera = this.setDevice("cameraDevice");
    setFilterWheel = this.setDevice("filterWheelDevice");
    setFocuser = this.setDevice("focuserDevice");
    imagingSetupAccessorFactory = defaultMemoize(ImagingSetupStore.imagingSetupAccessor);
    focuserTemperatureReferenceProperty = defaultMemoize((uid:string)=>ImagingSetupStore.imagingSetupAccessor(uid).child(AccessPath.For((e)=>e.focuserSettings.temperatureProperty)));
    focuserInterruptGuiding = defaultMemoize((uid:string)=>ImagingSetupStore.imagingSetupAccessor(uid).child(AccessPath.For((e)=>e.focuserSettings.interruptGuiding)));

    render() {
        return (
            <>
                <div className="IndiProperty">
                        Name:
                        <TextEdit
                            value={this.props.name}
                            helpKey={namePropertyHelp}
                            onChange={(e)=>this.updateName(e)} />
                </div>
                <div className="IndiProperty">
                        Camera:
                        <CameraSelector
                                helpKey={cameraSelectorHelp}
                                active={this.props.cameraDevice}
                                setValue={this.setCamera}
                                />
                </div>
                <div className="IndiProperty">
                        Filter wheel:
                        <FilterWheelSelector
                                active={this.props.filterWheelDevice}
                                helpKey={filterWheelSelectorHelp}
                                setValue={this.setFilterWheel}
                                nullAlwaysPossible={true}
                                />
                </div>
                <div className="IndiProperty">
                        Focuser:
                        <FocuserSelector
                                active={this.props.focuserDevice}
                                helpKey={focuserSelectorHelp}
                                setValue={this.setFocuser}
                                nullAlwaysPossible={true}
                                />
                </div>
                {this.props.focuserDevice
                    ?
                    <div >
                        {this.props.filterWheelDevice
                            ? <>
                                <div>Focuser adjustment for filters:</div>
                                <IndiFilterWheelFocusAdjusterConfig accessor={this.imagingSetupAccessorFactory(this.props.imagingSetupUid)}/>
                            </>
                            : null
                        }
                        <div>Focuser temperature adjustment source:</div>
                        <IndiPropertyIdentifierSelector
                                helpKey={temperaturePropertySelectorHelp}
                                accessor={this.focuserTemperatureReferenceProperty(this.props.imagingSetupUid)}/>
                        {this.props.hasFocuserTemperatureReferenceProperty
                            ?
                                <>
                                    <div>{focusStepPerDegreeHelp.title}:</div>
                                    <TextEdit
                                        helpKey={focusStepPerDegreeHelp}
                                        busy={!!this.state.busy}
                                        value={this.props.focusStepPerDegree === null ? "" : (this.props.focusStepPerDegree||0).toString()}
                                        onChange={this.updateFocusStepPerDegree} />
                                </>

                            : null
                        }
                        {this.props.filterWheelDevice || this.props.hasFocuserTemperatureReferenceProperty
                            ?
                                <>
                                    <div>{focusStepToleranceHelp.title}:</div>
                                    <TextEdit
                                        busy={!!this.state.busy}
                                        helpKey={focusStepToleranceHelp}
                                        value={this.props.focusStepTolerance.toString()}
                                        onChange={this.updateFocusStepTolerance} />
                                </>
                            : null
                        }
                        <div>
                            <Bool accessor={this.focuserInterruptGuiding(this.props.imagingSetupUid)}
                                helpKey={focuserInterruptGuidingHelp}></Bool>
                            {focuserInterruptGuidingHelp.title}
                        </div>
                    </div>
                    : null
                }

            </>
        );
    }

    static mapStateToProps(store:Store.Content, ownProps: InputProps):MappedProps {
        const byuuid= store.backend?.imagingSetup?.configuration?.byuuid;
        if (Utils.has(byuuid, ownProps.imagingSetupUid)) {
            const {cameraDevice, filterWheelDevice, focuserDevice, focuserSettings, ...details} = byuuid![ownProps.imagingSetupUid];

            const hasFocuserTemperatureReferenceProperty = !!focuserSettings?.temperatureProperty;
            const focusStepPerDegree = (focuserSettings || {focusStepPerDegree: null}).focusStepPerDegree;
            const focusStepTolerance = focuserSettings?.focusStepTolerance || 0;
            return {
                visible: true,
                name: details.name,
                cameraDevice, filterWheelDevice, focuserDevice,
                hasFocuserTemperatureReferenceProperty,
                focusStepPerDegree,
                focusStepTolerance,
            }
        } else {
            return {
                visible: false,
                name: '',
                cameraDevice: null,
                filterWheelDevice: null,
                focuserDevice: null,
                hasFocuserTemperatureReferenceProperty: false,
                focusStepPerDegree: 0,
                focusStepTolerance: 0,
            }
        }
    }
}

export default Store.Connect(ImagingSetupEditor);