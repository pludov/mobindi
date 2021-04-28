import * as React from 'react';

import * as Utils from "./Utils";

import * as Help from "./Help";
import * as BackendRequest from "./BackendRequest";
import * as AccessPath from './utils/AccessPath';
import * as Store from "./Store";
import * as ImagingSetupStore from "./ImagingSetupStore";
import CancellationToken from 'cancellationtoken';

import TextEdit from './TextEdit';
import PromiseSelector, { Props as PromiseSelectorProps }  from './PromiseSelector';

import { connect } from 'react-redux';
import { createSelector, defaultMemoize } from 'reselect'
import { ImagingSetup } from '@bo/BackOfficeStatus';
import IndiFilterWheelFocusAdjusterConfig from './IndiFilterWheelFocusAdjusterConfig';
import IndiPropertySelector from './indiview/IndiPropertyIdentifierSelector';
import IndiPropertyIdentifierSelector from './indiview/IndiPropertyIdentifierSelector';

const temperaturePropertySelectorHelp = Help.key("Select temperature source", "Select a INDI property that will be used for temperature compensation at the focuser");


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
}

type Props = InputProps & MappedProps;


type State = {}

class ImagingSetupEditor extends React.PureComponent<Props, State> {

    constructor(props: Props) {
        super(props);
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

    setCamera = this.setDevice("cameraDevice");
    setFilterWheel = this.setDevice("filterWheelDevice");
    setFocuser = this.setDevice("focuserDevice");
    imagingSetupAccessorFactory = defaultMemoize(ImagingSetupStore.imagingSetupAccessor);
    focuserTemperatureReferenceProperty = defaultMemoize((uid:string)=>ImagingSetupStore.imagingSetupAccessor(uid).child(AccessPath.For((e)=>e.focuserSettings.temperatureProperty)));

    render() {
        return (
            <>
                <div className="IndiProperty">
                        Name:
                        <TextEdit
                            value={this.props.name}
                            onChange={(e)=>this.updateName(e)} />
                </div>
                <div className="IndiProperty">
                        Camera:
                        <CameraSelector
                                active={this.props.cameraDevice}
                                setValue={this.setCamera}
                                />
                </div>
                <div className="IndiProperty">
                        Filter wheel:
                        <FilterWheelSelector
                                active={this.props.filterWheelDevice}
                                setValue={this.setFilterWheel}
                                nullAlwaysPossible={true}
                                />
                </div>
                <div className="IndiProperty">
                        Focuser:
                        <FocuserSelector
                                active={this.props.focuserDevice}
                                setValue={this.setFocuser}
                                nullAlwaysPossible={true}
                                />
                </div>
                {this.props.focuserDevice && this.props.filterWheelDevice
                    ?
                    <div >
                        <div>Focuser adjustment for filters:</div>
                        <IndiFilterWheelFocusAdjusterConfig accessor={this.imagingSetupAccessorFactory(this.props.imagingSetupUid)}/>
                        <div>Focuser temperature adjustment source:</div>
                        <IndiPropertyIdentifierSelector
                                helpKey={temperaturePropertySelectorHelp}
                                accessor={this.focuserTemperatureReferenceProperty(this.props.imagingSetupUid)}/>
                    </div>
                    : null
                }

            </>
        );
    }

    static mapStateToProps(store:Store.Content, ownProps: InputProps):MappedProps {
        const byuuid= store.backend?.imagingSetup?.configuration?.byuuid;
        if (Utils.has(byuuid, ownProps.imagingSetupUid)) {
            const {cameraDevice, filterWheelDevice, focuserDevice, ...details} = byuuid![ownProps.imagingSetupUid];

            return {
                visible: true,
                name: details.name,
                cameraDevice, filterWheelDevice, focuserDevice,
            }
        } else {
            return {
                visible: false,
                name: '',
                cameraDevice: null,
                filterWheelDevice: null,
                focuserDevice: null,
            }
        }
    }
}

export default Store.Connect(ImagingSetupEditor);