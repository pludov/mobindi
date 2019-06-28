import * as React from 'react';
import CancellationToken from 'cancellationtoken';
import {SortableContainer, SortableElement, arrayMove} from 'react-sortable-hoc';

import { SequenceStep, DitheringSettings } from '@bo/BackOfficeStatus';
import * as Utils from '../Utils';
import * as Store from '../Store';
import * as BackendRequest from '../BackendRequest';
import TextEdit from "../TextEdit";
import CameraFrameTypeEditor from '../CameraFrameTypeEditor';
import FilterSelector from '../FilterSelector';
import ArrayReselect from '../utils/ArrayReselect';

import { hasKey } from '../shared/Obj';

import "./SequenceStepEdit.css";
import { UpdateSequenceStepRequest, UpdateSequenceStepDitheringRequest } from '@bo/BackOfficeAPI';
import CameraExpEditor from '../CameraExpEditor';
import CameraIsoEditor from '../CameraIsoEditor';
import CameraBinEditor from '../CameraBinEditor';
import SequenceStepParameterSplitter from './SequenceStepParameterSplitter';
import { parameters, ParamDesc, CameraCapacity } from "./SequenceStepParameter";
import DitheringSettingEdit from './DitheringSettingEdit';
import Modal from '@src/Modal';

export type ForcedParams = {[id: string]: {param: string, uid:string}};

type InputProps = {
    sequenceUid: string;
    sequenceStepUidPath: string;
    allowRemove: boolean;
    camera: string;
    cameraCapacity: CameraCapacity;

    // Force a new parameter
    forcedParam?: keyof SequenceStep;
    // This uid must change for the forceParam to take effect
    forcedParamUid?: string;
    forcedParamFocus?: boolean;

    bodyRef?: React.RefObject<HTMLDivElement>;
    focusRef?: React.RefObject<HTMLSelectElement>;
}

type MappedProps = {
    detailsStack: SequenceStep[];
    cameraCapacity: CameraCapacity;
}

type Props = InputProps & MappedProps;

type State = {
    dropButtonBusy?: boolean;
    newItems: {[id: string]: true};
    lastNewItem?: string;
    lastNewItemSerial: number;

    overridenChildList?: undefined|string[];
    sourceChildList?: undefined|string[];
    parameterSplit: undefined|(ParamDesc& {id: keyof SequenceStep});

    // Force presence of a given parameter on childs (for split)
    forcedChilds?: ForcedParams;

    lastForcedParam?: string;
    lastForcedParamUid?: string;

};

const SortableItem = SortableElement<{
                        camera:string,
                        cameraCapacity: CameraCapacity,
                        sequenceUid: string,
                        parentPath: string,
                        sequenceStepUid:string,
                        forcedParam?: keyof SequenceStep,
                        forcedParamUid?: string,
                        itemRef?: React.RefObject<any>,
                        itemFocusRef?: React.RefObject<any>,
        }>(({camera, cameraCapacity, sequenceUid, sequenceStepUid, parentPath, forcedParam, forcedParamUid, itemRef, itemFocusRef})=> {
    return (<li className="SequenceStepMovableBlock">
                <MappedSequenceStepEdit
                        camera={camera}
                        cameraCapacity={cameraCapacity}
                        sequenceUid={sequenceUid}
                        sequenceStepUidPath={JSON.stringify(JSON.parse(parentPath).concat([sequenceStepUid]))}
                        forcedParam={forcedParam}
                        forcedParamUid={forcedParamUid}
                        allowRemove={true}
                        bodyRef={itemRef}
                        focusRef={itemFocusRef}/>
    </li>);
})

const SortableList = SortableContainer<{
                        items: string[],
                        camera:string,
                        cameraCapacity: CameraCapacity,
                        sequenceUid:string,
                        parentPath: string,
                        forcedParams: ForcedParams,
                        lastNewItem?: string,
                        lastNewItemRef?: React.RefObject<any>,
                        lastNewItemFocusRef?: React.RefObject<any>,
        }>(({items, camera, cameraCapacity, sequenceUid, parentPath, forcedParams, lastNewItem, lastNewItemRef, lastNewItemFocusRef}) => {
    return (
      <ul className="SequenceStepContainer">
        {items.map((sequenceStepUid: string, index:number) => {
            let forced;
            if (Object.prototype.hasOwnProperty.call(forcedParams, sequenceStepUid)) {
                forced = forcedParams[sequenceStepUid];
            }

            return <SortableItem
                    key={`item-${sequenceStepUid}`}
                    index={index}
                    camera={camera}
                    cameraCapacity={cameraCapacity}
                    sequenceUid={sequenceUid}
                    parentPath={parentPath}
                    sequenceStepUid={sequenceStepUid}
                    forcedParam={forced === undefined ? undefined : forced.param as keyof SequenceStep}
                    forcedParamUid={forced === undefined ? undefined : forced.uid}
                    itemRef={sequenceStepUid === lastNewItem ? lastNewItemRef : undefined}
                    itemFocusRef={sequenceStepUid === lastNewItem ? lastNewItemFocusRef : undefined}
                    />
        })}
      </ul>
    );
  });


class SequenceStepEdit extends React.PureComponent<Props, State> {
    // Keep the ref of the last new editor (to focus it)
    private lastNewItemRef = React.createRef<HTMLDivElement>();
    private lastNewItemFocusRef = React.createRef<HTMLBaseElement>();
    // lastNewEditorId is incremented on every componentDidUpdate to ensure focus is done once
    private lastNewItemId: number = 0;

    constructor(props:Props) {
        super(props);
        this.state = {
            parameterSplit: undefined,
            newItems: {},
            lastNewItemSerial: 0
        };
    }

    private getCurrentDetails() {
        return this.props.detailsStack[this.props.detailsStack.length - 1];
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

    private updateSequenceStepDitheringParam = async(wanted: boolean, settings?: Partial<DitheringSettings>) => {
        const payload:UpdateSequenceStepDitheringRequest = {
            sequenceUid: this.props.sequenceUid,
            stepUidPath: JSON.parse(this.props.sequenceStepUidPath),
            dithering: wanted,
        };
        if (settings) {
            payload.settings = settings;
        }
        await BackendRequest.RootInvoker("sequence")("updateSequenceStepDithering")(
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
            const uids = await BackendRequest.RootInvoker("sequence")("newSequenceStep")(
                CancellationToken.CONTINUE,
                {
                    sequenceUid: this.props.sequenceUid,
                    stepUidPath: JSON.parse(this.props.sequenceStepUidPath),
                });
            // set focus to new step
            this.setState({
                lastNewItem: uids[0],
                lastNewItemSerial: this.lastNewItemId,
            });
        } else if (value === "remove") {
            await this.deleteStep();
        } else {
            if (hasKey(this.state.newItems, value)) {
                return;
            }
            this.setState({
                newItems: {...this.state.newItems, [value]: true},
                lastNewItem: value,
                lastNewItemSerial: this.lastNewItemId,
            });
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
        const details = this.getCurrentDetails();
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
        // Update the state, then start a backoffice request
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
            this.setState({
                overridenChildList: undefined,
                sourceChildList: undefined,
            });
        }
    }

    private splitParameter=(param: ParamDesc& {id: keyof SequenceStep})=> {
        this.setState({parameterSplit: param});
    }

    private splittable=(param: ParamDesc)=> {
        if (!param.splittable) {
            return false;
        }
        if (this.getCurrentDetails().childs) {
            return false;
        }
        return true;
    }

    private finishSplit=(toRemove: keyof SequenceStep, p:ForcedParams) => {
        let newItems = this.state.newItems;
        if (Object.prototype.hasOwnProperty.call(newItems, toRemove)) {
            newItems = {...newItems};
            delete newItems[toRemove];
        }
        this.setState({
            newItems: newItems,
            forcedChilds: {...this.state.forcedChilds||{}, ...p}
        });
    }

    private closeParameterSplitter=()=>{
        this.setState({parameterSplit: undefined});
    }

    renderType=(p:ParamDesc, settingsPath: string, focusRef?: React.RefObject<any>)=> {
        return <CameraFrameTypeEditor
                        device={this.props.camera}
                        focusRef={focusRef}
                        valuePath={settingsPath + '.type'}
                        setValue={(e:string)=>Utils.promiseToState(()=>this.updateSequenceStepParam('type', e), this)}
                        />
    }

    renderExposure=(p:ParamDesc, settingsPath: string, focusRef?: React.RefObject<any>)=> {
        return <CameraExpEditor
                        device={this.props.camera}
                        focusRef={focusRef}
                        valuePath={settingsPath + '.exposure'}
                        setValue={(e:number)=>Utils.promiseToState(()=>this.updateSequenceStepParam('exposure', e), this)}
                        />
    }

    renderIso=(p:ParamDesc, settingsPath: string, focusRef?: React.RefObject<any>)=> {
        return <CameraIsoEditor
                        device={this.props.camera}
                        focusRef={focusRef}
                        valuePath={settingsPath + '.iso'}
                        setValue={(e:string)=>Utils.promiseToState(()=>this.updateSequenceStepParam('iso', e), this)}
                        />
    }

    renderBin=(p:ParamDesc, settingsPath: string, focusRef?: React.RefObject<any>)=> {
        return <CameraBinEditor
                        device={this.props.camera}
                        focusRef={focusRef}
                        valuePath={settingsPath + '.bin'}
                        setValue={(e:number)=>Utils.promiseToState(()=>this.updateSequenceStepParam('bin', e), this)}
                        />
    }

    renderFilter=(p:ParamDesc, settingsPath: string, focusRef?: React.RefObject<any>)=> {
        return <FilterSelector
                        deviceId={this.props.camera}
                        focusRef={focusRef}
                        setFilter={async(filterWheelDeviceId:string|null, filterId: string|null)=>{
                            if (filterId === null && filterWheelDeviceId !== null) {
                                return;
                            }
                            await this.updateSequenceStepParam('filter', filterId);
                        }}
                        getFilter={()=>this.getCurrentDetails().filter || null}
                    />
    }

    private ditheringDetailsModal = React.createRef<Modal>();

    renderDithering=(p:ParamDesc, settingsPath: string, focusRef?: React.RefObject<any>)=> {
        const val = this.props.detailsStack[this.props.detailsStack.length-1].dithering;

        return <>
            <select
                        value={val === undefined ? "" : val === null ? "false" : "true"}
                        ref={focusRef}
                        onChange={
                            (e: React.ChangeEvent<HTMLSelectElement>)=> Utils.promiseToState(
                                        ()=>this.updateSequenceStepDitheringParam(e.target.value === 'true'), this)
                        }>
                    <option value="" disabled hidden>Choose...</option>
                    <option value="true">On</option>
                    <option value="false">Off</option>
            </select>
            <input type="button" value="..." disabled={!val} onClick={()=>{
                const c = this.ditheringDetailsModal.current;
                if (c) c.open();
            }}/>
        </>;
    }

    renderDitheringDetails=(p:ParamDesc, settingsPath: string, focusRef?: React.RefObject<any>)=> {
        const val = this.props.detailsStack[this.props.detailsStack.length-1].dithering;
        return !!val
                ?<Modal ref={this.ditheringDetailsModal}>
                    <DitheringSettingEdit settings={val} update={
                            ({field, value})=> Utils.promiseToState(
                                ()=>this.updateSequenceStepDitheringParam(true, {[field]: value}), this)
                        }/>
                </Modal>
                : null
    }

    renderRepeat=(p:ParamDesc, settingsPath: string, focusRef?: React.RefObject<any>)=> {
        const valnum = this.props.detailsStack[this.props.detailsStack.length-1].repeat;
        
        if (valnum === undefined || (valnum >= 2 && valnum <= 10)) {
            return (
                <select value={valnum || ""}
                        ref={focusRef}
                        onChange={
                            (e: React.ChangeEvent<HTMLSelectElement>)=> Utils.promiseToState(
                                        ()=>this.updateSequenceStepParam('repeat', parseInt(e.target.value)), this)
                        }>
                    <option value="" disabled hidden>Choose...</option>
                    <option value="2">2x</option>
                    <option value="3">3x</option>
                    <option value="4">4x</option>
                    <option value="5">5x</option>
                    <option value="6">6x</option>
                    <option value="7">7x</option>
                    <option value="8">8x</option>
                    <option value="9">9x</option>
                    <option value="10">10x</option>
                    <option value="11">More...</option>
                </select>
            );
        } else {
            let valstr = (valnum === undefined ? "" : "" + valnum);

            return <TextEdit
                        value={valstr}
                        focusRef={focusRef}
                        onChange={(e:string)=> Utils.promiseToState(()=>this.updateSequenceStepParam('repeat', parseInt(e)), this)}/>
        }
    }

    componentDidUpdate() {
        const e = this.lastNewItemRef.current;
        if (e) {
            e.scrollIntoView({behavior: "smooth",
                    // Soon to be released option
                    scrollMode: 'if-needed',
                    block: 'nearest',
                    inline: 'nearest',
            } as any);

            const focus = this.lastNewItemFocusRef.current;
            if (focus) {
                focus.focus();
            }

            // Make sure that the next render will not set lastNewItemRef
            this.lastNewItemId++;
        }
    }

    private isItemAvailable(item:ParamDesc) {
        if (item.available) {
            return item.available(this.props.cameraCapacity, this.props.detailsStack)
        }
        return true;
    }

    render() {
        if (this.props.detailsStack.length === 0) {
            return null;
        }
        const details = this.getCurrentDetails();

        let settingsPath = 'backend.sequence.sequences.byuuid[' + JSON.stringify(this.props.sequenceUid) + '].root';
        for(const uid of JSON.parse(this.props.sequenceStepUidPath)) {
            settingsPath += ".childs.byuuid[" + JSON.stringify(uid) + "]";
        }

        return <div ref={this.props.bodyRef}>
            {this.state.parameterSplit !== undefined
                ? <SequenceStepParameterSplitter
                        camera={this.props.camera}
                        sequenceUid={this.props.sequenceUid}
                        sequenceStepUidPath={this.props.sequenceStepUidPath}
                        parameter={this.state.parameterSplit}
                        onSplit={this.finishSplit}
                        onClose={this.closeParameterSplitter}/>
                : null
            }
            {parameters.map((group)=>group.childs.map(param=>{
                if (param.hidden || !param.render || (!hasKey(details || {}, param.id) && !hasKey(this.state.newItems, param.id))) {
                    return null;
                }
                const isTheLastNew = (param.id === this.state.lastNewItem) && (this.state.lastNewItemSerial == this.lastNewItemId);
                const renderer = param.render(this);
                return (<>
                    <div className="SequenceStepProperty" key={param.id} ref={isTheLastNew ? this.lastNewItemRef : undefined}>
                            <span className="SequenceStepPropertyTitle">{param.title}:</span>

                            {renderer(param, settingsPath, isTheLastNew ? this.lastNewItemFocusRef : undefined)}

                            {this.splittable(param)
                                ? <input type="button"
                                    className="SequenceStepParameterForkBton"
                                    value={"\u{1d306}"}
                                    onClick={()=>this.splitParameter(param as ParamDesc & {id: keyof SequenceStep})}
                                    />
                                : null
                            }
                            <input type="button"
                                    className="SequenceStepParameterDropBton"
                                    value={"X"}
                                    onClick={()=>Utils.promiseToState(()=>this.dropParam(param), this)}/>
                    </div>
                    {param.renderMore ? param.renderMore(this)(param, settingsPath): null}
                </>);
            }))}

            <select ref={this.props.focusRef} value="" onChange={(e)=>Utils.promiseToState(()=>this.action(e), this)} placeholder="More...">
                <option value="" disabled hidden>More...</option>
                {
                    parameters.map(
                        group=> {
                            const items = group.childs.map(
                                item=>(
                                    (!hasKey(details || {}, item.id)) && (!hasKey(this.state.newItems, item.id) && this.isItemAvailable(item))
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
            {details.childs !== undefined
                ?
                <SortableList
                    sequenceUid={this.props.sequenceUid}
                    forcedParams={this.state.forcedChilds||{}}
                    items={this.state.overridenChildList||details.childs.list}
                    camera={this.props.camera}
                    cameraCapacity={this.props.cameraCapacity}
                    parentPath={this.props.sequenceStepUidPath}
                    onSortEnd={this.moveSteps}
                    pressDelay={200}
                    helperClass="sortableHelper"
                    lastNewItem={(this.state.lastNewItemSerial == this.lastNewItemId) ? this.state.lastNewItem: undefined}
                    lastNewItemRef={(this.state.lastNewItemSerial == this.lastNewItemId) ? this.lastNewItemRef: undefined}
                    lastNewItemFocusRef={(this.state.lastNewItemSerial == this.lastNewItemId) ? this.lastNewItemFocusRef: undefined}
                    />
                : null
            }
        </div>
    }

    static getDerivedStateFromProps(newProps:Props, state:State) {
        const ret: Partial<State> = {};

        if (newProps.forcedParamUid && newProps.forcedParamUid !== state.lastForcedParamUid) {
            // Force one childs (first render)
            ret.lastForcedParam = newProps.forcedParam;
            ret.lastForcedParamUid = newProps.forcedParamUid;
            ret.newItems = {...state.newItems, [newProps.forcedParam!]: true };
        }

        if (state.overridenChildList) {
            let p;
            if (newProps.detailsStack && newProps.detailsStack.length) {
                p = newProps.detailsStack[newProps.detailsStack.length - 1];
            }
            if ((p === undefined) || (!p.childs) || (!Utils.isArrayEqual(p.childs.list, state.sourceChildList))) {
                ret.overridenChildList = undefined;
                ret.sourceChildList = undefined;
            }
        }

        return ret;
    }


    static mapStateToProps=()=>{
        const empty:[] = [];
        const detailsStackFn = (store:Store.Content, ownProps:InputProps):SequenceStep[]=>{
            let detailsStack: SequenceStep[];
            try {
                let details = store.backend.sequence!.sequences.byuuid[ownProps.sequenceUid].root;
                detailsStack = [ details ];
                for(const childUid of JSON.parse(ownProps.sequenceStepUidPath)) {
                    details = details.childs!.byuuid[childUid];
                    detailsStack.push(details);
                }
                return detailsStack;
            } catch(e) {
                return empty;
            }
        }
        const detailsStackMem = ArrayReselect.createArraySelector(detailsStackFn);
        return (store:Store.Content, ownProps:InputProps)=> ({
            detailsStack: detailsStackFn(store, ownProps)
        })
    }
}

export {SequenceStepEdit};

const MappedSequenceStepEdit = Store.Connect(SequenceStepEdit);
export default MappedSequenceStepEdit;
