import React, { Component, PureComponent} from 'react';

import * as BackOfficeStatus from '@bo/BackOfficeStatus';
import { defaultMemoize } from 'reselect';
import * as Actions from '../Actions';
import * as Store from '../Store';
import * as Help from '../Help';
import * as AccessPath from '../shared/AccessPath';

import * as SequenceStore from '../SequenceStore';
import * as Utils from '../Utils';
import Table, { HeaderItem, FieldDefinition } from '../table/Table';
import SequenceEditDialog from './SequenceEditDialog';

import './SequenceView.css';
import { has } from '../shared/JsonProxy';
import * as BackOfficeAPI from '@bo/BackOfficeAPI';
import SequenceControler from './SequenceControler';
import SequenceSelector from './SequenceSelector';
import ImageDetail from "./ImageDetail";
import ToggleBton from '../primitives/ToggleBton';
import Conditional from '../primitives/Conditional';
import AccessorSelector from '../primitives/AccessorSelector';
import SequenceActivityMonitoringView from './SequenceActivityMonitoringView';
import SequenceFwhmMonitoringView from './SequenceFwhmMonitoringView';
import SequenceBackgroundMonitoringView from './SequenceBackgroundMonitoringView';


type SequenceViewDatabaseObject = {
    images?: BackOfficeStatus.CameraStatus["images"]["byuuid"],
    imageList?: BackOfficeStatus.Sequence["images"],
    imageStats?: BackOfficeStatus.Sequence["imageStats"],
    astrometryRefImageUuid: string|null,
}

type InputProps = {
};

type MappedProps = {
    editSequenceDefinitionUid: string|undefined;
    uid: string|undefined;
    accessors: AccessorFactory;
    currentMonitoring: SequenceStore.SequenceStoreContent["currentMonitoringView"];
};

type AdditionalImageStatus = {
    isAstrometryRef: boolean;
}

type SequenceViewProps = InputProps & MappedProps;

const fieldList:Array<FieldDefinition & {id:string}> = [
    {
        id: 'path',
        title:  'File',
        minimumWidth: '3em',
        grow: 1,
        render: (o:BackOfficeStatus.ImageStatus&BackOfficeStatus.ImageStats&AdditionalImageStatus)=>
            (o.path.indexOf('/') != -1 ? o.path.substring(o.path.lastIndexOf('/')+1) : o.path)
    },
    {
        id: 'astrometry',
        title: '🞋',
        minimumWidth: '1.2em',
        cellClass: 'cell-astrometry',
        render: (o:BackOfficeStatus.ImageStatus&BackOfficeStatus.ImageStats&AdditionalImageStatus)=>(
            o.astrometry ?
            <span className={`col-astrometry col-astrometry-${o.astrometry.found?"ok":"failed"}`}>
                {(o.astrometry.found && o.isAstrometryRef)  ?
                    <b>🏅</b> :
                    <b>🞋</b>
                }
            </span>
        : null)
    },
    {
        id: 'backgroundLevel',
        title: 'BG',
        minimumWidth: '4em',
        render: (o:BackOfficeStatus.ImageStats)=>(o.backgroundLevel === undefined ? null: <span className='stat-bg'>{Math.trunc(o.backgroundLevel * 65535).toString()}</span>),
    },
    {
        id: 'fwhm',
        title: 'FWHM',
        minimumWidth:'4em',
        render: (o:BackOfficeStatus.ImageStats)=>(o.fwhm === undefined ? null: <span className='stat-fwhm'>{o.fwhm.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits: 2})}</span>),
    },
    {
        id: 'guideStats',
        title: 'PHD',
        minimumWidth: '4em',
        render: (o:BackOfficeStatus.ImageStats)=>{
            const rms = o.guideStats?.RADECDistanceRMS;
            if (rms === null || rms === undefined) {
                return null;
            }
            return <span className='stat-guide-rms'>
                {rms.toLocaleString(undefined, {minimumFractionDigits:3, maximumFractionDigits: 3})}
            </span>;
        }
    }
]

const fields = fieldList.reduce((c, a)=>{c[a.id]=a; return c}, {} as {[id:string]:FieldDefinition});
const defaultHeader:HeaderItem[] = fieldList.map(e=>({id: e.id}));

class AccessorFactory {
    currentMonitoring= defaultMemoize(
        ()=>new SequenceStore.SequenceStoreContentAccessor().child(AccessPath.For((e)=>e.currentMonitoringView))
    );

    displayMonitoring= defaultMemoize(
        ()=>new Store.TransformAccessor<string | undefined, boolean>(
            new SequenceStore.SequenceStoreContentAccessor().child(AccessPath.For((e)=>e.currentMonitoringView)),
            {
                fromStore: (s:string|undefined)=>{
                    return !!s;
                },
                toStore: (b:boolean)=> {
                    if (!b) {
                        return undefined;
                    }
                    return Store.getStore().getState().sequence.lastMonitoringView || "activity";
                }
            }
        )
    );
}

class SequenceView extends PureComponent<SequenceViewProps> {
    constructor(props:SequenceViewProps) {
        super(props);
        this.state = {
        }
    }

    getItemList = (store:Store.Content)=>{
        const currentSequence = store.sequence.currentSequence;
        let seq = undefined;
        if (currentSequence && store.backend.sequence !== undefined && has(store.backend.sequence.sequences.byuuid, currentSequence)) {
            seq = store.backend.sequence.sequences.byuuid[currentSequence];
        }

        if (seq !== undefined) {
            return seq.images;
        } else {
            return [];
        }
    }

    setCurrentImage = (image:string)=> {
        Actions.dispatch<SequenceStore.SequenceActions>()("setCurrentImage", {image});
    }

    editSequence=(uid:string)=>{
        Actions.dispatch<SequenceStore.SequenceActions>()("setEditingSequence", {sequence: uid});
    }

    closeEditDialog = ()=> {
        Actions.dispatch<SequenceStore.SequenceActions>()("setEditingSequence", {sequence: undefined});
    }

    render() {
        //var self = this;
        return(<div className="SequenceView">
            {this.props.editSequenceDefinitionUid !== undefined
                ?
                    <SequenceEditDialog
                        uid={this.props.editSequenceDefinitionUid}
                        onClose={this.closeEditDialog}/>
                : null
            }
            <div className="SequenceControl">
                <SequenceSelector
                    currentPath='$.sequence.currentSequence'
                    onCreated={this.editSequence}
                />
                <SequenceControler
                    currentPath='$.sequence.currentSequence'
                    editSequence={this.editSequence}
                />
                <div>
                    <ToggleBton
                        className="SequenceViewMonitoringBton"
                        accessor={this.props.accessors.displayMonitoring()}
                        />
                    <Conditional
                        accessor={this.props.accessors.displayMonitoring()}>

                        <AccessorSelector
                            accessor={this.props.accessors.currentMonitoring()}>
                            <option value="activity">activity</option>
                            <option value="fwhm">fwhm</option>
                            <option value="background">background</option>
                        </AccessorSelector>
                    </Conditional>
                </div>
            </div>

            {this.props.currentMonitoring === undefined ?
                <>
                    <div className="SequenceViewDisplay">
                        <ImageDetail
                            currentPath='$.sequence.currentImage'
                            detailPath='$.backend.camera.images.byuuid'
                        />
                    </div>
                    <div className="SequenceViewTable">
                        <Table statePath="$.sequenceView.list"
                            itemHeight="1.20em"
                            fields={fields}
                            defaultHeader={defaultHeader}
                            getDatabases={(store:Store.Content):SequenceViewDatabaseObject=>
                                {
                                    const currentSequenceId = store.sequence.currentSequence;
                                    const currentSequence = Utils.getOwnProp(store.backend.sequence?.sequences?.byuuid, currentSequenceId);
                                    return {
                                        images: store.backend.camera?.images.byuuid,
                                        imageList: currentSequence?.images,
                                        imageStats: currentSequence?.imageStats,
                                        astrometryRefImageUuid: currentSequence?.astrometryRefImageUuid || null,
                                    };
                                }
                            }
                            getItemList={(db:SequenceViewDatabaseObject)=>(db.imageList||[])}
                            getItem={(db:SequenceViewDatabaseObject,uid:string):BackOfficeStatus.ImageStatus&Partial<BackOfficeStatus.ImageStats>&AdditionalImageStatus=>
                                ({
                                    ...Utils.getOwnProp(db.images, uid)!,
                                    ...Utils.getOwnProp(db.imageStats, uid),
                                    isAstrometryRef: db.astrometryRefImageUuid === uid,
                                })}
                            currentPath='$.sequence.currentImage'
                            currentAutoSelectSerialPath='$.sequence.currentImageAutoSelectSerial'
                            onItemClick={this.setCurrentImage}
                        />
                    </div>
                </>
            :null}

            {this.props.currentMonitoring === 'activity' && this.props.uid !== undefined ?
                <SequenceActivityMonitoringView uid={this.props.uid}/>
            :null}

            {this.props.currentMonitoring === 'fwhm' && this.props.uid !== undefined ?
                <SequenceFwhmMonitoringView uid={this.props.uid}/>
            :null}

            {this.props.currentMonitoring === 'background' && this.props.uid !== undefined ?
                <SequenceBackgroundMonitoringView uid={this.props.uid}/>
            :null}

        </div>);
    }

    static mapStateToProps: ()=>(store: Store.Content, ownProps: InputProps) => MappedProps =() => {
        const accessors = new AccessorFactory();

        return (store: Store.Content, ownProps: InputProps)=> {
            const uid = store.sequence.currentSequence;
            const editUid = store.sequence?.editingSequence;
            const currentMonitoring = accessors.currentMonitoring().fromStore(store);
            return {
                accessors,
                currentMonitoring,
                uid,
                editSequenceDefinitionUid: editUid,
            };
        }
    }
}


export default Store.Connect(SequenceView);