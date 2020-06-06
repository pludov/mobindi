import React, { Component, PureComponent} from 'react';

import * as BackOfficeStatus from '@bo/BackOfficeStatus';

import * as Actions from '../Actions';
import * as Store from '../Store';
import * as BackendRequest from '../BackendRequest';

import * as SequenceStore from '../SequenceStore';
import * as Utils from '../Utils';
import Table from '../table/Table';
import { atPath } from '../shared/JsonPath';
import SequenceEditDialog from './SequenceEditDialog';

import './SequenceView.css';
import { has } from '../shared/JsonProxy';
import * as BackOfficeAPI from '@bo/BackOfficeAPI';
import SequenceControler from './SequenceControler';
import SequenceSelector from './SequenceSelector';
import ImageDetail from "./ImageDetail";


type SequenceViewProps = {
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
            return store.backend.camera === undefined ? [] : store.backend.camera.images.list
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
            <SequenceEditDialog
                currentPath='$.sequence.editingSequence'
                onClose={this.closeEditDialog}/>

            <div className="SequenceControl">
                <SequenceSelector
                    currentPath='$.sequence.currentSequence'
                    onCreated={this.editSequence}
                />
                <SequenceControler
                    currentPath='$.sequence.currentSequence'
                    editSequence={this.editSequence}
                />
            </div>
            <div className="SequenceViewDisplay">
                <ImageDetail
                    currentPath='$.sequence.currentImage'
                    detailPath='$.backend.camera.images.byuuid'
                />
            </div>
            <div className="SequenceViewTable">
                <Table statePath="$.sequenceView.list"
                    fields={{
                        path: {
                            title:  'File',
                            defaultWidth: '15em',
                            render: (o:BackOfficeAPI.ShootResult)=>(o === undefined ? "N/A" : o.path.indexOf('/') != -1 ? o.path.substring(o.path.lastIndexOf('/')+1) : o.path)
                        },
                        device: {
                            title:  'Device',
                            defaultWidth: '12em'
                        }
                    }}
                    defaultHeader={[{id: 'path'}, {id: 'device'}]}
                    getItemList={this.getItemList}
                    getItem={(store:any,uid:string)=>(atPath(store, '$.backend.camera.images.byuuid')[uid])}
                    currentPath='$.sequence.currentImage'
                    onItemClick={this.setCurrentImage}
                />
            </div>
        </div>);
    }
}


export default SequenceView;