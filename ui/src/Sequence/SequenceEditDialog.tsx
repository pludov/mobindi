import * as React from 'react';

import { Sequence } from '@bo/BackOfficeStatus';
import {SortableContainer, SortableElement, arrayMove} from 'react-sortable-hoc';

import * as Utils from '../Utils';
import * as Store from '../Store';
import * as BackendRequest from '../BackendRequest';
import { atPath } from '../shared/JsonPath';
import StatePropCond from '../StatePropCond';
import TextEdit from "../TextEdit";
import DeviceConnectBton from '../DeviceConnectBton';
import CameraBinEditor from '../CameraBinEditor';
import CameraIsoEditor from '../CameraIsoEditor';
import CameraExpEditor from '../CameraExpEditor';
import CameraSelector from "./CameraSelector";
import KeepValue from "./KeepValue";
import SequenceStepEdit from "./SequenceStepEdit";
import CancellationToken from 'cancellationtoken';

// TODO : create a "new" item list in sequence (in PromiseSeletor)
// TODO : create a full screen sequence editor (a component that can be added as top level of the view)
//   Field: Name
//   Global settings:
//          (mandatory) device
//          (mandatory) exposure
//          (optional) bin
//          (optional) iso
//          (mandatory) dithering
//   Sequence (array)
//       (mandatory) type
//       (mandatory) repeat
//       (optional) bin
//       (optional) exposure
//       (optional) iso



const SortableItem = SortableElement<{camera:string, sequenceUid: string, sequenceStepUid:string, allowRemove:boolean}>(({camera, sequenceUid, sequenceStepUid, allowRemove})=> {
    return (<li className="SequenceStepMovableBlock">
                <SequenceStepEdit camera={camera} sequenceUid={sequenceUid} sequenceStepUid={sequenceStepUid} allowRemove={allowRemove}/>
    </li>);
})

const SortableList = SortableContainer<{items: string[], camera:string, sequenceUid:string}>(({items, camera, sequenceUid}) => {
    return (
      <ul className="SequenceStepContainer">
        {items.map((sequenceStepUid: string, index:number) => (
          <SortableItem
                    key={`item-${index}`}
                    index={index}
                    camera={camera}
                    sequenceUid={sequenceUid}
                    sequenceStepUid={sequenceStepUid}
                    allowRemove={items.length > 1} />
        ))}
      </ul>
    );
  });

type InputProps = {
    currentPath: string;
    onClose: ()=>void;
}

type MappedProps = {
    displayable: boolean
    uid?: string;
    details?: Sequence;
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
        this.moveSteps = this.moveSteps.bind(this);
    }

    getCurrentStepList():string[] {
        if (this.state.overridenList !== null
                && this.state.overridenListSource === this.props.details!.steps.list) {
            return this.state.overridenList;
        }
        return this.props.details!.steps.list;
    }

    private newStep = async()=> {
        const newUid = await BackendRequest.RootInvoker("sequence")("newSequenceStep")(
            CancellationToken.CONTINUE,
            {
                sequenceUid: this.props.uid!,
            });
        // FIXME: focus the newUid ?
    }

    private deleteStep = async(sequenceStepUid:string)=>{
        await BackendRequest.RootInvoker("sequence")("deleteSequenceStep")(
            CancellationToken.CONTINUE,
            {
                sequenceUid: this.props.uid!,
                sequenceStepUid: sequenceStepUid,
            });
    }

    async moveSequenceSteps(sequenceStepUidList:string[]) {
        await BackendRequest.RootInvoker("sequence")("moveSequenceSteps")(
            CancellationToken.CONTINUE,
            {
                sequenceUid: this.props.uid!,
                sequenceStepUidList: sequenceStepUidList,
            });
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


    private moveStepsEnd=()=>{
        this.setState((state: State, props: Props) => {
            state = {
                    ...state,
                    runningMoves: state.runningMoves - 1
            };
            if (state.runningMoves == 0) {
                state.overridenList = null;
                state.overridenListSource = null;
            }
            return state;
        });
    }

    private moveSteps=(param: {oldIndex:number, newIndex:number})=>{
        const {oldIndex, newIndex} = param;
        if (oldIndex == newIndex) return;
        var newOrder = arrayMove(this.getCurrentStepList(), oldIndex, newIndex);
        var initialOrder = this.props.details!.steps.list;

        // Update the state, then start a trigger
        this.setState((state:State, props:Props)=>
            ({
                ...state,
                overridenList: newOrder,
                overridenListSource: initialOrder,
                runningMoves: state.runningMoves + 1
            }),
            async ()=>{
                try {
                    await this.moveSequenceSteps(this.getCurrentStepList())
                } finally {
                    this.moveStepsEnd();
                }
            });
    }

    
    render() {
        if (!this.props.displayable || this.props.details === undefined || this.props.uid === undefined) {
            return null;
        }
        var self =this;
        var settingsPath = 'backend.sequence.sequences.byuuid[' + JSON.stringify(this.props.uid) + ']';

        var exposureParam = {
            valuePath: settingsPath + '.exposure',
            set: (e:number|string|null)=>this.updateSequenceParam('exposure', e)
        };

        var binningParam = {
            valuePath: settingsPath + '.binning',
            set: (e:number|string|null)=>this.updateSequenceParam('binning', e)
        };

        var isoParam = {
            valuePath: settingsPath + '.iso',
            set: (e:number|string|null)=>this.updateSequenceParam('iso', e)
        };

        function isParamOverride(store:Store.Content, param: {valuePath: string}) {
            var v = atPath(store, param.valuePath);
            if (v !== null && v !== undefined) return true;
            return undefined;
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
                <StatePropCond
                            device={this.props.details.camera}
                            property="CCD_EXPOSURE"
                            overridePredicate={(store)=>isParamOverride(store, exposureParam)}>
                    <div className="IndiProperty">
                            Exp:
                            <KeepValue
                                    valuePath={exposureParam.valuePath}
                                    setValue={exposureParam.set}>
                                <CameraExpEditor
                                    device={this.props.details.camera || ""}
                                    valuePath={exposureParam.valuePath}
                                    setValue={exposureParam.set}
                                />
                            </KeepValue>
                    </div>
                </StatePropCond>
                <StatePropCond
                            device={this.props.details.camera}
                            property="CCD_BINNING"
                            overridePredicate={(store)=>isParamOverride(store, binningParam)}>
                    <div className="IndiProperty">
                            Bin:
                            <KeepValue
                                    valuePath={binningParam.valuePath}
                                    setValue={binningParam.set}>
                                <CameraBinEditor
                                    device={this.props.details.camera || ""}
                                    valuePath={binningParam.valuePath}
                                    setValue={binningParam.set}
                                />
                            </KeepValue>
                    </div>
                </StatePropCond>
                <StatePropCond
                            device={this.props.details.camera}
                            property="CCD_ISO"
                            overridePredicate={(store)=>isParamOverride(store, isoParam)}>
                    <div className="IndiProperty">
                            Iso:
                            <KeepValue
                                    valuePath={isoParam.valuePath}
                                    setValue={isoParam.set}>
                                <CameraIsoEditor
                                    device={this.props.details.camera || ""}
                                    valuePath={isoParam.valuePath}
                                    setValue={isoParam.set}
                                />
                            </KeepValue>
                    </div>
                </StatePropCond>

                <SortableList items={this.getCurrentStepList()}
                        onSortEnd={this.moveSteps}
                        camera={this.props.details.camera || ""}
                        sequenceUid={this.props.uid}
                        pressDelay={200}
                        helperClass="sortableHelper"/>

                <input type='button' value='Add a step'
                    disabled={!!this.state.AddStepBusy}
                    onClick={e=>Utils.promiseToState(this.newStep, this, "AddStepBusy")}/>

                <input type='button' value='Close' onClick={this.props.onClose}/>
            </div>
        </div>;
    }

    static mapStateToProps(store: Store.Content, ownProps: InputProps):MappedProps {
        var selected = atPath(store, ownProps.currentPath);
        if (!selected) {
            return {
                displayable: false,
            };
        }
        var details = Utils.noErr(()=>store.backend.sequence!.sequences.byuuid[selected], undefined);
        if (details == undefined) {
            return {
                displayable: false,
            };
        }
        return {
            displayable: true,
            uid: selected,
            details: details
        };
    }
}

export default Store.Connect(SequenceEditDialog);
