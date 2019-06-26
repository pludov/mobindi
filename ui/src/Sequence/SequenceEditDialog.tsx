import * as React from 'react';

import { Sequence } from '@bo/BackOfficeStatus';

import * as Utils from '../Utils';
import * as Store from '../Store';
import * as BackendRequest from '../BackendRequest';
import { atPath } from '../shared/JsonPath';
import TextEdit from "../TextEdit";
import DeviceConnectBton from '../DeviceConnectBton';
import CameraSelector from "./CameraSelector";
import * as SequenceStepParameter from "./SequenceStepParameter";
import SequenceStepEdit from "./SequenceStepEdit";
import CancellationToken from 'cancellationtoken';


type InputProps = {
    currentPath: string;
    onClose: ()=>void;
}

type MappedProps = {
    displayable: boolean;
    uid?: string;
    details?: Sequence;
    cameraCapacity: SequenceStepParameter.CameraCapacity;
}

type Props = InputProps & MappedProps;

type State = {
    runningMoves: number;
    overridenList: null | string[];
    overridenListSource: null | string[];
    AddStepBusy?: boolean;
}

class SequenceEditDialog extends React.PureComponent<Props, State> {
    constructor(props:Props) {
        super(props);
        this.state = {
            runningMoves: 0,
            overridenList: null,
            overridenListSource: null
        };
    }

    private updateSequenceParam = async(param: string, value: any) => {
        await BackendRequest.RootInvoker("sequence")("updateSequence")(
            CancellationToken.CONTINUE,
            {
                sequenceUid: this.props.uid!,
                param,
                value
            });
    }

    render() {
        if (!this.props.displayable || this.props.details === undefined || this.props.uid === undefined) {
            return null;
        }

        return <div className="Modal">
            <div className="ModalContent">
                <div className="IndiProperty">
                        Title:
                        <TextEdit
                            value={this.props.details.title}
                            onChange={(e)=>this.updateSequenceParam('title', e)} />
                </div>
                <div className="IndiProperty">
                        Camera:
                        <CameraSelector
                            getValue={(store)=>Utils.noErr(()=>store.backend.sequence!.sequences.byuuid[this.props.uid!].camera, null)}
                            setValue={(e)=>this.updateSequenceParam('camera', e)}
                        />
                        <DeviceConnectBton.forActivePath
                            activePath={"$.backend.sequence.sequences.byuuid[" + JSON.stringify(this.props.uid) +"].camera"}
                        />
                </div>

                <SequenceStepEdit
                        allowRemove={false}
                        camera={this.props.details.camera || ""}
                        cameraCapacity={this.props.cameraCapacity}
                        sequenceUid={this.props.uid}
                        sequenceStepUidPath="[]"
                    />

                <input type='button' value='Close' onClick={this.props.onClose}/>
            </div>
        </div>;
    }

    static mapStateToProps:()=>(store: Store.Content, ownProps: InputProps)=>MappedProps=()=>{
        const cameraCapacitySelector = SequenceStepParameter.cameraCapacityReselect();
        return (store: Store.Content, ownProps: InputProps)=> {
            var selected = atPath(store, ownProps.currentPath);
            if (!selected) {
                return {
                    displayable: false,
                    cameraCapacity: {},
                };
            }
            var details = Utils.noErr(()=>store.backend.sequence!.sequences.byuuid[selected], undefined);
            if (details == undefined) {
                return {
                    displayable: false,
                    cameraCapacity: {},
                };
            }
            return {
                displayable: true,
                uid: selected,
                details: details,
                cameraCapacity: details.camera !== null ? cameraCapacitySelector(store, details.camera) : {},
            };
        }
    }
}

export default Store.Connect(SequenceEditDialog);
