import * as React from 'react';
import CancellationToken from 'cancellationtoken';
import {SortableContainer, SortableElement, arrayMove} from 'react-sortable-hoc';

import { SequenceStep } from '@bo/BackOfficeStatus';
import * as Utils from '../Utils';
import * as Store from '../Store';
import * as BackendRequest from '../BackendRequest';
import TextEdit from "../TextEdit";
import CameraFrameTypeEditor from '../CameraFrameTypeEditor';
import FilterSelector from '../FilterSelector';
import ArrayReselect from '../utils/ArrayReselect';

import { hasKey } from '../shared/Obj';

import "./SequenceStepEdit.css";
import { UpdateSequenceStepRequest } from '@bo/BackOfficeAPI';
import CameraExpEditor from '../CameraExpEditor';
import CameraIsoEditor from '../CameraIsoEditor';
import CameraBinEditor from '../CameraBinEditor';

type InputProps = {
    sequenceUid: string;
    sequenceStepUidPath: string;
    allowRemove: boolean;
    camera: string;
}

type MappedProps = {
    detailsStack: SequenceStep[];
}

type Props = InputProps & MappedProps;

type State = {
    dropButtonBusy?: boolean;
    newItems: {[id: string]: true};
    overridenChildList?: undefined|string[];
    sourceChildList?: undefined|string[];
};

const SortableItem = SortableElement<{camera:string, sequenceUid: string, parentPath: string, sequenceStepUid:string}>(({camera, sequenceUid, sequenceStepUid, parentPath})=> {
    return (<li className="SequenceStepMovableBlock">
                <MappedSequenceStepEdit
                        camera={camera}
                        sequenceUid={sequenceUid}
                        sequenceStepUidPath={JSON.stringify(JSON.parse(parentPath).concat([sequenceStepUid]))}
                        allowRemove={true}/>
    </li>);
})

const SortableList = SortableContainer<{items: string[], camera:string, sequenceUid:string, parentPath: string}>(({items, camera, sequenceUid, parentPath}) => {
    return (
      <ul className="SequenceStepContainer">
        {items.map((sequenceStepUid: string, index:number) => (
          <SortableItem
                    key={`item-${sequenceStepUid}`}
                    index={index}
                    camera={camera}
                    sequenceUid={sequenceUid}
                    parentPath={parentPath}
                    sequenceStepUid={sequenceStepUid}/>
        ))}
      </ul>
    );
  });

type ParamDesc = {
    id: string;
    title: string;
    splittable?: boolean;
    hidden?: boolean;
    render?:(s:SequenceStepEdit)=>((p: ParamDesc, settingsPath: string)=>JSX.Element);
}

type GroupDesc = {
    id: string;
    title: string;
    childs: ParamDesc[];
};

const parameters:GroupDesc[] = [
    {
        id: "camera",
        title: "Camera",
        childs: [
            {
                id: "type",
                title: "Frame type",
                splittable: true,
                render: (s)=>s.renderType,
            },
            {
                id: "exposure",
                title: "Exp",
                splittable: true,
                render: (s)=>s.renderExposure,
            },
            {
                id: "iso",
                title: "ISO",
                splittable: true,
                // indi_camera_prop: 'CCD_ISO',
                render: (s)=>s.renderIso,
            },
            {
                id:"bin",
                title: "BIN",
                splittable: true,
                render: (s)=>s.renderBin,
            },
            {
                id: "filter",
                title: "Filter",
                splittable: true,
                render: (s)=>s.renderFilter,
            },
        ]
    },
    {
        id: "guider",
        title: "Guider",
        childs: [
            {
                id: "dithering",
                title: "Dithering",
                splittable: false,
                render: (s)=>s.renderDithering,
            },
        ]
    },
    {
        id: "control",
        title: "Flow Control",

        childs: [
            {
                id: "repeat",
                title: "Repeat",
                splittable: false,
                render: (s)=>s.renderRepeat,
            },
            {
                id: "addChild",
                title: "Add child",
                splittable: false,
                hidden: true,
            },
            {
                id: "remove",
                title: "Remove",
                splittable: false,
                hidden: true,
            }
        ]
    }
];

class SequenceStepEdit extends React.PureComponent<Props, State> {
    constructor(props:Props) {
        super(props);
        this.state = {
            newItems: {}
        };
    }

    private updateSequenceStepParam = async(param: UpdateSequenceStepRequest["param"], value: UpdateSequenceStepRequest["value"]) => {
        const payload:UpdateSequenceStepRequest = {
            sequenceUid: this.props.sequenceUid,
            stepUidPath: JSON.parse(this.props.sequenceStepUidPath),
            param
        };
        if (value !== undefined) {
            payload.value = value;
        }
        await BackendRequest.RootInvoker("sequence")("updateSequenceStep")(
            CancellationToken.CONTINUE,
            payload,
            );
    }

    private deleteStep = async() => {
        const path:string[] = JSON.parse(this.props.sequenceStepUidPath);
        await BackendRequest.RootInvoker("sequence")("deleteSequenceStep")(
            CancellationToken.CONTINUE,
            {
                sequenceUid: this.props.sequenceUid,
                stepUidPath: path.slice(0, path.length - 1),
                stepUid: path[path.length - 1]
            });
    }

    private action = async (e:React.ChangeEvent<HTMLSelectElement>)=> {
        const value = e.target.value;

        if (value === "addChild") {
            await BackendRequest.RootInvoker("sequence")("newSequenceStep")(
                CancellationToken.CONTINUE,
                {
                    sequenceUid: this.props.sequenceUid,
                    stepUidPath: JSON.parse(this.props.sequenceStepUidPath),
                });
            // FIXME: set focus to new step
        } else if (value === "remove") {
            await this.deleteStep();
        } else {
            if (hasKey(this.state.newItems, value)) {
                return;
            }
            this.setState({newItems: {...this.state.newItems, [value]: true}});
        }
    }

    
    dropParam=async (p:ParamDesc)=>{
        const id : keyof SequenceStep = p.id as any;
        if (hasKey(this.props.detailsStack[this.props.detailsStack.length-1], p.id)) {
            await this.updateSequenceStepParam(id, undefined);
        }
        if (hasKey(this.state.newItems, id)) {
            // Simply remove from newItems
            const newNewItems = {...this.state.newItems};
            delete newNewItems[id];
            this.setState({newItems: newNewItems});
        }
    }
    

    private getChildList = (propsOnly?:boolean)=>{
        if ((!propsOnly) && this.state.overridenChildList) {
            return this.state.overridenChildList;
        }
        if (!this.props.detailsStack.length) {
            return undefined;
        }
        const details = this.props.detailsStack[this.props.detailsStack.length - 1];
        if (!details.childs) {
            return undefined;
        }
        return details.childs.list;
    }

    private moveSteps=async (param: {oldIndex:number, newIndex:number})=>{
        const {oldIndex, newIndex} = param;
        if (oldIndex == newIndex) return;

        const originalList = this.getChildList(true);
        const childList = this.getChildList(false);
        
        if (childList === undefined) {
            return;
        }
        console.log('currentORder is ', childList, oldIndex, newIndex);
        const newOrder = arrayMove([...childList], oldIndex, newIndex);
        console.log('newOrder is ', newOrder);
        // Update the state, then start a trigger
        this.setState({
                overridenChildList: newOrder,
                sourceChildList: originalList,
        });

        try {
            await BackendRequest.RootInvoker("sequence")("moveSequenceSteps")(
                CancellationToken.CONTINUE,
                {
                    sequenceUid: this.props.sequenceUid,
                    stepUidPath: JSON.parse(this.props.sequenceStepUidPath),
                    childs: newOrder,
                });

        } finally {
            // FIXME: sure the backend updated the state already?
            this.setState({
                overridenChildList: undefined,
                sourceChildList: undefined,
            });
        }
    }


    renderType=(p:ParamDesc, settingsPath: string)=> {
        return <CameraFrameTypeEditor
                        device={this.props.camera}
                        valuePath={settingsPath + '.type'}
                        setValue={(e:string)=>Utils.promiseToState(()=>this.updateSequenceStepParam('type', e), this)}
                        />
    }

    renderExposure=(p:ParamDesc, settingsPath: string)=> {
        return <CameraExpEditor
                        device={this.props.camera}
                        valuePath={settingsPath + '.exposure'}
                        setValue={(e:number)=>Utils.promiseToState(()=>this.updateSequenceStepParam('exposure', e), this)}
                        />
    }

    renderIso=(p:ParamDesc, settingsPath: string)=> {
        return <CameraIsoEditor
                        device={this.props.camera}
                        valuePath={settingsPath + '.iso'}
                        setValue={(e:string)=>Utils.promiseToState(()=>this.updateSequenceStepParam('iso', e), this)}
                        />
    }

    renderBin=(p:ParamDesc, settingsPath: string)=> {
        return <CameraBinEditor
                        device={this.props.camera}
                        valuePath={settingsPath + '.bin'}
                        setValue={(e:number)=>Utils.promiseToState(()=>this.updateSequenceStepParam('bin', e), this)}
                        />
    }

    renderFilter=(p:ParamDesc, settingsPath: string)=> {
        return <FilterSelector
                        deviceId={this.props.camera}
                        setFilter={async(filterWheelDeviceId:string|null, filterId: string|null)=>{
                            if (filterId === null && filterWheelDeviceId !== null) {
                                return;
                            }
                            await this.updateSequenceStepParam('filter', filterId);
                        }}
                        getFilter={()=>this.props.detailsStack[this.props.detailsStack.length - 1].filter || null}
                    />
    }

    renderDithering=(p:ParamDesc, settingsPath: string)=> {
        const val = this.props.detailsStack[this.props.detailsStack.length-1].dithering;
        return <input
                        type="checkbox"
                        checked={!!val}
                        onChange={(e) =>Utils.promiseToState(()=>this.updateSequenceStepParam('dithering', !!e.target.checked), this)}/>
    }

    renderRepeat=(p:ParamDesc, settingsPath: string)=> {
        const valnum = this.props.detailsStack[this.props.detailsStack.length-1].repeat;
        let valstr = (valnum === undefined ? "" : "" + valnum);

        return <TextEdit
                    value={valstr}
                    onChange={(e:string)=> Utils.promiseToState(()=>this.updateSequenceStepParam('repeat', parseInt(e)), this)}/>
    }

    // Juste afficher le count
    render() {
        if (this.props.detailsStack.length === 0) {
            return null;
        }
        const details = this.props.detailsStack[this.props.detailsStack.length - 1];

        let settingsPath = 'backend.sequence.sequences.byuuid[' + JSON.stringify(this.props.sequenceUid) + '].root';
        for(const uid of JSON.parse(this.props.sequenceStepUidPath)) {
            settingsPath += ".childs.byuuid[" + JSON.stringify(uid) + "]";
        }
        return <div>
            {parameters.map((group)=>group.childs.map(param=>{
                if (param.hidden || !param.render || (!hasKey(details || {}, param.id) && !hasKey(this.state.newItems, param.id))) {
                    return null;
                }
                const renderer = param.render(this);
                return (<div className="SequenceStepProperty" key={param.id}>
                            <span className="SequenceStepPropertyTitle">{param.title}:</span>
                            {renderer(param, settingsPath)}
                            <input type="button" className="SequenceStepParameterForkBton" value={"\u{1d306}"}></input>
                            <input type="button"
                                    className="SequenceStepParameterDropBton"
                                    value={"X"}
                                    onClick={()=>Utils.promiseToState(()=>this.dropParam(param), this)}/>
                </div>);
            }))}

            {/* <div className="IndiProperty">
                Type:
                <CameraFrameTypeEditor
                        device={this.props.camera}
                        valuePath={settingsPath + '.type'}
                        setValue={(e:string)=>Utils.promiseToState(()=>this.updateSequenceStepParam('type', e), this)}
                        />
            </div>
            <div className="IndiProperty">
                Repeat:
                <TextEdit
                    value={this.props.details.repeat == null ? "" : "" + this.props.details.repeat}
                    onChange={(e:string)=> Utils.promiseToState(()=>this.updateSequenceStepParam('repeat', parseInt(e)), this)}/>
            </div> */}
            <select value="" onChange={(e)=>Utils.promiseToState(()=>this.action(e), this)} placeholder="More...">
                <option value="" disabled hidden>More...</option>
                {
                    parameters.map(
                        group=> {
                            const items = group.childs.map(
                                item=>(
                                    (!hasKey(details || {}, item.id)) && (!hasKey(this.state.newItems, item.id))
                                        ? <option key={item.id} value={item.id}>{item.title}</option>
                                        : null
                                )
                            )

                            return items.some((e)=>e!==null)
                                ? <optgroup key={group.id} label={group.title}>{items}</optgroup>
                                : null
                        }
                    )
                }
            </select>
            {/* <div className="IndiProperty">
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
            </div> */}
            {/* {!this.props.allowRemove ? null :
                <input
                    type="button"
                    value="remove"
                    onClick={e=>Utils.promiseToState(this.deleteStep, this, "dropButtonBusy")}
                    disabled={!!this.state.dropButtonBusy}
                    />
            } */}
            {details.childs !== undefined
                ?
                <SortableList
                    sequenceUid={this.props.sequenceUid}
                    items={this.state.overridenChildList||details.childs.list}
                    camera={this.props.camera}
                    parentPath={this.props.sequenceStepUidPath}
                    onSortEnd={this.moveSteps}
                    pressDelay={200}
                    helperClass="sortableHelper"
                    />
                : null
            }
        </div>
    }

    static getDerivedStateFromProps(newProps:Props, state:State) {
        if (state.overridenChildList) {
            let p;
            if (newProps.detailsStack && newProps.detailsStack.length) {
                p = newProps.detailsStack[newProps.detailsStack.length - 1];
            }
            if ((p === undefined) || (!p.childs) || (!Utils.isArrayEqual(p.childs.list, state.sourceChildList))) {
                console.log('cleaning overridenChildList');
                return {
                    overridenChildList: undefined,
                    sourceChildList: undefined,
                };
            }
        }
        return null;
    }


    static mapStateToProps=()=>{
        const detailsStackFn = (store:Store.Content, ownProps:InputProps):SequenceStep[]=>{
            let detailsStack: SequenceStep[];
            try {
                let details = store.backend.sequence!.sequences.byuuid[ownProps.sequenceUid].root;
                detailsStack = [ details ];
                console.log('SequenceStepEdit iterate', details, store.backend.sequence);
                for(const childUid of JSON.parse(ownProps.sequenceStepUidPath)) {
                    console.log('SequenceStepEdit iterate', childUid);
                    details = details.childs!.byuuid[childUid];
                    detailsStack.push(details);
                }
                console.log('SequenceStepEdit', details);
                return detailsStack;
            } catch(e) {
                console.log('mapStateToProp failed', e);
                return [];
            }
        }
        const detailsStackMem = ArrayReselect.createArraySelector(detailsStackFn);
        return (store:Store.Content, ownProps:InputProps)=> ({
            detailsStack: detailsStackFn(store, ownProps)
        })
    }
}

const MappedSequenceStepEdit = Store.Connect(SequenceStepEdit);
export default MappedSequenceStepEdit;
