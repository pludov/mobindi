import React, { Component, PureComponent} from 'react';
import { connect } from 'react-redux';
import { createSelector } from 'reselect'

import * as BackOfficeStatus from '@bo/BackOfficeStatus';

import * as Utils from './Utils';
import PromiseSelector from './PromiseSelector';
import * as Promises from './shared/Promises';
import Table from './Table';
import StatusLabel from './StatusLabel';
import { atPath } from './shared/JsonPath';
import SequenceEditDialog from './SequenceEditDialog';
import { Connect } from './utils/Connect';
import FitsViewerWithAstrometry from './FitsViewerWithAstrometry';

import './SequenceView.css';
import { has } from './shared/JsonProxy';

type SequenceImageDetailInputProps = {
    app: any;
    currentPath: string;
    detailPath: string;
}

type SequenceImageDetailMappedProps = {
    url: string|null;
}

type SequenceImageDetailProps = SequenceImageDetailInputProps & SequenceImageDetailMappedProps

class DiscSequenceImageDetail extends PureComponent<SequenceImageDetailProps> {

    render() {
        return <FitsViewerWithAstrometry
                            contextKey="sequence"
                            app={this.props.app}
                            src={this.props.url || ""}
                        />;
    }

    static mapStateToProps(store:any, ownProps: SequenceImageDetailInputProps):SequenceImageDetailMappedProps {
        var selected = atPath(store, ownProps.currentPath);

        if (!selected) {
            return {
                url: null
            };
        }
        var details = atPath(store, ownProps.detailPath + '[' + JSON.stringify(selected) + ']');
        if (details === undefined) {
            return {url: null};
        }
        return {
            url: details.path
        };
    }
}

const SequenceImageDetail = Connect<DiscSequenceImageDetail, SequenceImageDetailInputProps, {}, SequenceImageDetailMappedProps>(DiscSequenceImageDetail);



const SequenceSelector = connect(()=>{
    const sequenceSelectorBaseProps = {
        placeholder: 'Sequence...',
        nullAlwaysPossible: true,
        getTitle: (id:string, props:any)=>(id && props.definitions[id] ? props.definitions[id].title : null)
    }
    
    const controlSelector = createSelector(
            [ (state:any, ownProps:any) => ownProps.app ],
            app => ({
                setValue:(id:string)=>(new Promises.Immediate(()=>app.setCurrentSequence(id))),
                controls: [{
                    id:'new',
                    title:'New',
                    run: ()=>app.newSequence()
                }]
            }));

    return (store:any, ownProps:any)=> ({
        ... sequenceSelectorBaseProps,
        ... controlSelector(store, ownProps),
        active: atPath(store, ownProps.currentPath),
        availables: store.backend.camera.sequences.list,
        definitions: store.backend.camera.sequences.byuuid
    })
})(PromiseSelector);

type SequenceControlerInputProps = {
    app: any;
    currentPath: string;
}
type SequenceControlerMappedProps = {
    uuid?: string;
    current?: BackOfficeStatus.Sequence;
}

type SequenceControlerProps = SequenceControlerInputProps & SequenceControlerMappedProps;

type SequenceControlerState = {
    // FIXME: not compatible with async state
    runningPromise?: any;
}

class DiscSequenceControler extends PureComponent<SequenceControlerProps, SequenceControlerState> {
    constructor(props:SequenceControlerProps) {
        super(props);
        this.state = {};
    }

    render() {
        var clickable = {
            start: false,
            stop: false,
            edit: false,
            drop: false,
            reset: false
        }
        if (this.props.current) {
            clickable.edit = true;
            clickable.drop = true;
            clickable.reset = true;
        }
        if (this.props.current && !this.state.runningPromise) {
            switch(this.props.current.status) {
                case 'running':
                    clickable.stop = true;
                    clickable.drop = false;
                    clickable.reset = false;
                    break;
                case 'done':
                    break;
                default:
                    clickable.start = true;
                    break;
            }
        }

        var statusStr = !this.props.current
                ? ("")
                : (
                    this.props.current.status == 'error'
                    ? this.props.current.errorMessage
                    :  this.props.current.status);
        return(<div>
            <div className='messageContainer'>
                    <div className='messageTitle' key="title">Status:</div>
                    <div className='messageContent' key="status">
                        <StatusLabel
                                text={statusStr}
                                className={"SequenceStatus" + (this.props.current ? this.props.current.status.toUpperCase() : "NONE")} />
                        {this.props.current && this.props.current.progress ? <i>{this.props.current.progress}</i> : null}
                    </div>
            </div>
            <input
                type='button'
                value='Start'
                id='Start'
                disabled={!clickable.start}
                onClick={(e)=>Utils.promiseToState(this.props.app.startSequence(this.props.uuid), this)}
            />
            <input
                type='button'
                value='Stop'
                id='Stop'
                disabled={!clickable.stop}
                onClick={(e)=>Utils.promiseToState(this.props.app.stopSequence(this.props.uuid), this)}
            />
            <input type='button' disabled={!clickable.edit} value='edit' onClick={()=>this.props.app.editCurrentSequence()}/>
            <input type='button' disabled={!clickable.reset} value='reset' onClick={(e)=>Utils.promiseToState(this.props.app.resetSequence(this.props.uuid), this)}/>
            <input type='button' disabled={!clickable.drop} value='drop' onClick={(e)=>Utils.promiseToState(this.props.app.dropSequence(this.props.uuid), this)}/>
        </div>);
    }

    static mapStateToProps(store:any, ownProps: SequenceControlerInputProps):SequenceControlerMappedProps {
        var selected = atPath(store, ownProps.currentPath);
        if (!selected) {
            return {}
        }
        var currentSequence = store.backend.camera.sequences.byuuid[selected];
        return {
            uuid: selected,
            current: currentSequence
        };
    }
}

const SequenceControler = Connect<DiscSequenceControler, SequenceControlerInputProps, {}, SequenceControlerMappedProps>(DiscSequenceControler);

type SequenceViewProps = {
    app:any;
}

class SequenceView extends PureComponent<SequenceViewProps> {
    constructor(props:SequenceViewProps) {
        super(props);
        this.state = {
            sequenceEditDialogVisible: false
        }
    }

    getItemList = (store:any)=>{
        const currentSequence = store.sequence.currentSequence;
        let seq = undefined;
        if (currentSequence && has(store.backend.camera.sequences.byuuid, currentSequence)) {
            seq = store.backend.camera.sequences.byuuid[currentSequence];
        }

        if (seq !== undefined) {
            return seq.images;
        } else {
            return store.backend.camera.images.list
        }
    }

    render() {
        //var self = this;
        return(<div className="CameraView">
            <SequenceEditDialog currentPath='$.sequence.currentSequenceEdit' app={this.props.app}/>
            <div>
                <SequenceSelector
                    app={this.props.app}
                    currentPath='$.sequence.currentSequence'
                />
                <SequenceControler
                    app={this.props.app}
                    currentPath='$.sequence.currentSequence'
                />
            </div>
            <SequenceImageDetail
                currentPath='$.sequence.currentImage'
                detailPath='$.backend.camera.images.byuuid'
                app={this.props.app}
            />
            <Table statePath="$.sequenceView.list"
                fields={{
                    path: {
                        title:  'File',
                        defaultWidth: '15em',
                        render: (o:BackOfficeStatus.ShootResult)=>(o === undefined ? "N/A" : o.path.indexOf('/') != -1 ? o.path.substring(o.path.lastIndexOf('/')+1) : o.path)
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
                onItemClick={this.props.app.setCurrentImage}
            />
        </div>);
    }
}


export default SequenceView;