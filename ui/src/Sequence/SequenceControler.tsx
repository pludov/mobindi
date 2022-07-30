import * as React from 'react';

import * as BackOfficeStatus from '@bo/BackOfficeStatus';

import * as Utils from '../Utils';
import * as Store from '../Store';
import * as Help from '../Help';
import * as BackendRequest from '../BackendRequest';
import { atPath } from '../shared/JsonPath';

import * as BackOfficeAPI from '@bo/BackOfficeAPI';
import StatusLabel from './StatusLabel';
import CancellationToken from 'cancellationtoken';
import Modal from '../Modal';

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
    runningPromise: number;
}

export class SequenceControler extends React.PureComponent<Props, State> {
    private static startBtonHelp = Help.key("Start", "Start the current sequence. The sequence will restart after the last successfull frame if possible.");
    private static stopBtonHelp = Help.key("Stop", "Stop the current sequence. The current exposure is aborted immediately. It is possible to restart it later (Start)");
    private static editBtonHelp = Help.key("edit", "Edit the definition of the sequence. Most parameter can be adjusted while sequence is running. They'll be applied after the end of the current exposure.");
    private static editMonitoringBtonHelp = Help.key("monitoring", "Configure monitoring for the sequence. This emit notification and possibly will pause the sequence when some conditions are met (like FWHM degradation, ...)");
    private static resetBtonHelp = Help.key("reset", "Reset the current sequence. It will restart from the begining, whatever process has already been made.");
    private static dropBtonHelp = Help.key("drop", "Remove the sequence from the list. The image files are not dropped.");


    private static confirmDropBtonHelp = Help.key("confirm", "Confirm sequence removal");
    private static abortDropBtonHelp = Help.key("abort", "Abort sequence removal");

    constructor(props:Props) {
        super(props);
        this.state = {
            runningPromise: 0
        };
    }

    private deleteConfirm = React.createRef<Modal>();

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

    private confirmDropSequence = async()=> {
        this.deleteConfirm.current?.open();
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
            reset: false,
            monitor: false,
        }
        if (this.props.current) {
            clickable.edit = true;
            clickable.drop = true;
            clickable.reset = true;
            clickable.monitor = true;
        }
        if (this.props.current && !this.state.runningPromise) {
            switch(this.props.current.status) {
                case 'running':
                    clickable.stop = true;
                    clickable.drop = false;
                    clickable.reset = false;
                    break;
                case 'done':
                    clickable.monitor = false;
                    break;
                default:
                    clickable.start = true;
                    break;
            }
        }

        const monitoringActive = this.props.current?.backgroundMonitoring.enabled
                        || this.props.current?.fwhmMonitoring.enabled
                        || this.props.current?.activityMonitoring.enabled;
        const monitoring = monitoringActive ? '🔔' : '🔕';

        const statusStr:string = !this.props.current
                ? ("")
                : (
                    this.props.current.status == 'error'
                    ? '' + this.props.current.errorMessage
                    :  this.props.current.status);
        return(<>
            <div className='SequenceStatusContainer'>
                    Status:

                    <StatusLabel
                            text={statusStr}
                            className={"SequenceStatus" + (this.props.current ? this.props.current.status.toUpperCase() : "NONE")} />
                    {this.props.current && this.props.current.progress ? <i>{this.props.current.progress}</i> : null}

            </div>
            <div className='SequenceStatusBreak'></div>
            <div>
                <input
                    {...SequenceControler.startBtonHelp.dom()}
                    className="GlyphBton"
                    type='button'
                    value='▶'
                    id='Start'
                    disabled={!clickable.start}
                    onClick={(e)=>Utils.promiseToState(this.startSequence, this)}
                />
                <input
                    {...SequenceControler.stopBtonHelp.dom()}
                    className="GlyphBton"
                    type='button'
                    value='⏸'
                    id='Stop'
                    disabled={!clickable.stop}
                    onClick={(e)=>Utils.promiseToState(this.stopSequence, this)}
                />
                <input className="GlyphBton" {...SequenceControler.editBtonHelp.dom()} type='button' disabled={!clickable.edit} value='✏️' onClick={this.openEditDialog}/>
                <input className="GlyphBton" {...SequenceControler.resetBtonHelp.dom()} type='button' disabled={!clickable.reset} value='↻' onClick={(e)=>Utils.promiseToState(this.resetSequence, this)}/>
                <input className="GlyphBton" {...SequenceControler.dropBtonHelp.dom()} type='button' disabled={!clickable.drop} value='❌' onClick={this.confirmDropSequence}/>
                <Modal
                        closeOnChange={this.props.uuid}
                        ref={this.deleteConfirm}
                        closeHelpKey={SequenceControler.abortDropBtonHelp} 
                        controlButtons={<input type="button" onClick={(e)=>Utils.promiseToState(this.dropSequence, this)} value={SequenceControler.dropBtonHelp.title} {...SequenceControler.confirmDropBtonHelp.dom()}></input>}
                        >
                    <div>Confirm removal of sequence {this.props.current?.title} ?
                    </div>
                </Modal>
            </div>
        </>);
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
