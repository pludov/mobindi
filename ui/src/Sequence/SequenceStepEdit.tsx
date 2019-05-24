import * as React from 'react';
import CancellationToken from 'cancellationtoken';

import { SequenceStep } from '@bo/BackOfficeStatus';
import * as Utils from '../Utils';
import * as Store from '../Store';
import * as BackendRequest from '../BackendRequest';
import TextEdit from "../TextEdit";
import CameraFrameTypeEditor from '../CameraFrameTypeEditor';
import FilterSelector from '../FilterSelector';

import KeepValue from './KeepValue';

type InputProps = {
    sequenceUid: string;
    sequenceStepUid: string;
    allowRemove: boolean;
    camera: string;
}

type MappedProps = {
    details: SequenceStep|undefined;
}

type Props = InputProps & MappedProps;

type State = {
    dropButtonBusy?: boolean;
};

class SequenceStepEdit extends React.PureComponent<Props, State> {
    constructor(props:Props) {
        super(props);
        this.state = {};
    }

    private updateSequenceParam = async(param: string, value: any) => {
        await BackendRequest.RootInvoker("camera")("updateSequence")(
            CancellationToken.CONTINUE,
            {
                sequenceUid: this.props.sequenceUid,
                sequenceStepUid: this.props.sequenceStepUid,
                param,
                value
            });
    }

    private deleteStep = async() => {
        await BackendRequest.RootInvoker("camera")("deleteSequenceStep")(
            CancellationToken.CONTINUE,
            {
                sequenceUid: this.props.sequenceUid,
                sequenceStepUid: this.props.sequenceStepUid,
            });
    }

    // Juste afficher le count
    render() {
        var settingsPath = 'backend.camera.sequences.byuuid[' + JSON.stringify(this.props.sequenceUid) + '].steps.byuuid[' + JSON.stringify(this.props.sequenceStepUid) + ']';
        if (this.props.details === undefined) {
            return null;
        }
        return <div>
            <div className="IndiProperty">
                Type:
                <CameraFrameTypeEditor
                        device={this.props.camera}
                        valuePath={settingsPath + '.type'}
                        setValue={(e:string)=>Utils.promiseToState(()=>this.updateSequenceParam('type', e), this)}
                        />
            </div>
            <div className="IndiProperty">
                Count:
                <TextEdit
                    value={this.props.details.count == null ? "" : "" + this.props.details.count}
                    onChange={(e:string)=> Utils.promiseToState(()=>this.updateSequenceParam('count', parseInt(e)), this)}/>
            </div>
            <div className="IndiProperty">
                Filter:
                <KeepValue
                        valuePath={settingsPath+".filter"}
                        setValue={()=>this.updateSequenceParam('filter', null)}>

                    <FilterSelector
                        deviceId={this.props.camera}
                        setFilter={async(filterWheelDeviceId:string|null, filterId: string|null)=>{
                            if (filterId === null && filterWheelDeviceId !== null) {
                                return;
                            }
                            await this.updateSequenceParam('filter', filterId);
                        }}
                        getFilter={()=>this.props.details!.filter || null}
                    />
                </KeepValue>
            </div>
            <div className="IndiProperty">
                Dither:
                <input
                        type="checkbox"
                        checked={this.props.details.dither? true : false}
                        onChange={(e) =>Utils.promiseToState(()=>this.updateSequenceParam('dither', e.target.checked?1:0), this)}/>
            </div>
            {!this.props.allowRemove ? null :
                <input
                    type="button"
                    value="remove"
                    onClick={e=>Utils.promiseToState(this.deleteStep, this, "dropButtonBusy")}
                    disabled={!!this.state.dropButtonBusy}
                    />
            }
        </div>
    }

    static mapStateToProps(store:Store.Content, ownProps:InputProps):MappedProps {
        const details = Utils.noErr(()=>store.backend.camera!.sequences.byuuid[ownProps.sequenceUid].steps.byuuid[ownProps.sequenceStepUid], undefined);
        if (details === undefined) {
            return {
                details: undefined
            };
        }
        return {
            details: details
        };
    }

}
export default Store.Connect(SequenceStepEdit);
