import React, { Component, PureComponent} from 'react';
import PropTypes from 'prop-types';
import { notifier, BackendStatus } from './Store';
import { connect } from 'react-redux';

import * as Utils from './Utils';
import PromiseSelector from './PromiseSelector';
import * as Promises from './shared/Promises';
import Table from './Table';
import StatusLabel from './StatusLabel';
import { atPath } from './shared/JsonPath';
import FitsViewerInContext from './FitsViewerInContext';
import './SequenceView.css';
import SequenceEditDialog from './SequenceEditDialog';


class SequenceImageDetail extends PureComponent {

    render() {
        return <div className="FitsViewer FitsViewContainer">
                    <FitsViewerInContext 
                            contextKey="default"
                            app={this.props.app}
                            src={this.props.url}
                        />
        </div>;
    }

    static mapStateToProps(store, ownProps) {
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

SequenceImageDetail = connect(SequenceImageDetail.mapStateToProps)(SequenceImageDetail);

SequenceImageDetail.propTypes = {
    currentPath: PropTypes.string.isRequired,
    app: PropTypes.any.isRequired
}

const SequenceSelector = connect((store, ownProps)=> ({
    active: atPath(store, ownProps.currentPath),
    availables: store.backend.camera.sequences.list,
    definitions: store.backend.camera.sequences.byuuid,
    placeholder: 'Sequence...',
    getTitle:(id, props)=>(id && props.definitions[id] ? props.definitions[id].title : null),
    setValue:(id)=>(new Promises.Immediate(()=>ownProps.app.setCurrentSequence(id))),
    nullAlwaysPossible: true,

    controls: [{
        id:'new',
        title:'New',
        run: ()=>ownProps.app.newSequence()
    }]
}))(PromiseSelector);

class SequenceControler extends PureComponent {
    constructor(props) {
        super(props);
        this.state = {};
    }

    render() {
        var clickable = {
            start: false,
            stop: false,
            edit: false,
            drop: false
        }
        if (this.props.current) {
            clickable.edit = true;
            clickable.drop = true;
        }
        if (this.props.current && !this.state.runningPromise) {
            switch(this.props.current.status) {
                case 'running':
                    clickable.stop = true;
                    clickable.drop = false;
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
            <input type='button' disabled={!clickable.drop} value='drop' onClick={(e)=>Utils.promiseToState(this.props.app.dropSequence(this.props.uuid), this)}/>
        </div>);
    }

    static mapStateToProps(store, ownProps) {
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

SequenceControler = connect(SequenceControler.mapStateToProps)(SequenceControler);

SequenceControler.propTypes = {
    currentPath: PropTypes.string.isRequired
}


class SequenceView extends PureComponent {
    constructor(props) {
        super(props);
        this.state = {
            sequenceEditDialogVisible: false
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
                        render: (o)=>(o.path.indexOf('/') != -1 ? o.path.substring(o.path.lastIndexOf('/')+1) : o.path)
                    },
                    device: {
                        title:  'Device',
                        defaultWidth: '12em'
                    }
                }}
                defaultHeader={[{id: 'path'}, {id: 'device'}]}
                getItemList={(store)=>(atPath(store, '$.backend.camera.images.list'))}
                getItem={(store,uid)=>(atPath(store, '$.backend.camera.images.byuuid')[uid])}
                currentPath='$.sequence.currentImage'
                onItemClick={this.props.app.setCurrentImage}
            />
        </div>);
    }
}


export default SequenceView;