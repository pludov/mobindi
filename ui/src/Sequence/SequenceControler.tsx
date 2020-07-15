import * as React from 'react';

import * as BackOfficeStatus from '@bo/BackOfficeStatus';

import * as Utils from '../Utils';
import * as Store from '../Store';
import * as BackendRequest from '../BackendRequest';
import { atPath } from '../shared/JsonPath';

import * as BackOfficeAPI from '@bo/BackOfficeAPI';
import StatusLabel from './StatusLabel';
import CancellationToken from 'cancellationtoken';

type InputProps = {
    currentPath: string;
    editSequence:(uid:string)=>(void);
}
type MappedProps = {
    uuid?: string;
    current?: BackOfficeStatus.Sequence;
}

type Props = InputProps & MappedProps;

type State = {
    runningPromise?: boolean;
}

export class SequenceControler extends React.PureComponent<Props, State> {
    constructor(props:Props) {
        super(props);
        this.state = {
        };
    }

    private startSequence = async()=>{
        await BackendRequest.RootInvoker("sequence")("startSequence")(
            CancellationToken.CONTINUE,
            {
                sequenceUid: this.props.uuid!,
            });
    }

    private stopSequence = async()=>{
        await BackendRequest.RootInvoker("sequence")("stopSequence")(
            CancellationToken.CONTINUE,
            {
                sequenceUid: this.props.uuid!,
            });
    }
    
    private resetSequence = async()=>{
        await BackendRequest.RootInvoker("sequence")("resetSequence")(
            CancellationToken.CONTINUE,
            {
                sequenceUid: this.props.uuid!,
            });
    }

    private dropSequence = async()=>{
        await BackendRequest.RootInvoker("sequence")("dropSequence")(
            CancellationToken.CONTINUE,
            {
                sequenceUid: this.props.uuid!,
            });
    }

    private openEditDialog = ()=>{
        this.props.editSequence(this.props.uuid!);
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

        const statusStr:string = !this.props.current
                ? ("")
                : (
                    this.props.current.status == 'error'
                    ? '' + this.props.current.errorMessage
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
                onClick={(e)=>Utils.promiseToState(this.startSequence, this)}
            />
            <input
                type='button'
                value='Stop'
                id='Stop'
                disabled={!clickable.stop}
                onClick={(e)=>Utils.promiseToState(this.stopSequence, this)}
            />
            <input type='button' disabled={!clickable.edit} value='edit' onClick={this.openEditDialog}/>
            <input type='button' disabled={!clickable.reset} value='reset' onClick={(e)=>Utils.promiseToState(this.resetSequence, this)}/>
            <input type='button' disabled={!clickable.drop} value='drop' onClick={(e)=>Utils.promiseToState(this.dropSequence, this)}/>
        </div>);
    }

    static mapStateToProps(store:Store.Content, ownProps: InputProps):MappedProps {
        var selected = atPath(store, ownProps.currentPath);
        if (!selected) {
            return {}
        }
        var currentSequence = store.backend.sequence?.sequences.byuuid[selected];
        return {
            uuid: selected,
            current: currentSequence
        };
    }
}

export default Store.Connect(SequenceControler);
