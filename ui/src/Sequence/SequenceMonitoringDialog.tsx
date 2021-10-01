import * as React from 'react';
import { defaultMemoize } from 'reselect';

import { SequenceActivityMonitoring } from '@bo/BackOfficeStatus';

import * as Utils from '../Utils';
import * as Help from '../Help';
import * as AccessPath from '../shared/AccessPath';
import * as Store from '../Store';
import * as SequenceStore from '../SequenceStore';
import * as BackendRequest from '../BackendRequest';
import TextEdit from "../TextEdit";
import * as SequenceStepParameter from "./SequenceStepParameter";
import CancellationToken from 'cancellationtoken';
import Bool from '@src/primitives/Bool';
import Float from '@src/primitives/Float';
import Modal from '@src/Modal';
import SequenceStatMonitoringDialog from './SequenceStatMonitoringDialog';


type InputProps = {
    uid: string;
    onClose: ()=>void;
}

type MappedProps = {
    displayable: boolean;
    title: string;
    activityMonitoring: SequenceActivityMonitoring;
}

type Props = InputProps & MappedProps;

type State = {
}

class SequenceMonitoringDialog extends React.PureComponent<Props, State> {
    private static closeBtonHelp = Help.key("Close", "Return to the sequence list. Changes are saved as they are made.");
    private static enableActivityMonitoringHelp = Help.key(
        "Activity monitoring",
        "Emit a notification if the sequence is not progressing for longer than this duration. " +
        "This includes all time spent between exposures, including focuser, dithering, image transfert. " +
        "The actual exposure duration is not accounted for."
    );
    private static activityMonitoringDurationHelp = Help.key(
        "Inactivity thresold",
        "Maximum number of seconds expected between exposures. " +
        "This must be large enough to cover duration of dithering, filter switch, image transfert, ... " +
        "The actual exposure duration is not accounted for."
    );

    private static enableFwhmMonitoringHelp = Help.key(
        "Watch FWHM evolution"
    );

    private static fwhmMonitoringSettingsHelp = Help.key(
        "Show FWHM monitoring status & parameters"
    );

    private static enableBackgroundMonitoringHelp = Help.key(
        "Watch background level evolution"
    );

    private static backgroundMonitoringSettingsHelp = Help.key(
        "Show background level monitoring status & parameters"
    );

    private fwhmMonitoringModal = React.createRef<Modal>();
    private backgroundMonitoringModal = React.createRef<Modal>();

    constructor(props:Props) {
        super(props);
        this.state = {
        };
    }

    private sequenceAccessor = defaultMemoize(
        (uid:string)=>SequenceStore.sequenceAccessor(uid)
    );

    private activityMonitoringAccessor = defaultMemoize(
        (uid:string)=>this.sequenceAccessor(uid).child(AccessPath.For((e)=>e.activityMonitoring.enabled))
    );

    private activityMonitoringDurationAccessor = defaultMemoize(
        (uid:string)=>new Store.UndefinedToNullAccessor(this.sequenceAccessor(uid).child(AccessPath.For((e)=>e.activityMonitoring.duration)))
    );

    private fwhmMonitoringAccessor = defaultMemoize(
        (uid:string)=>this.sequenceAccessor(uid).child(AccessPath.For((e)=>e.fwhmMonitoring.enabled))
    );

    private backgroundMonitoringAccessor = defaultMemoize(
        (uid:string)=>this.sequenceAccessor(uid).child(AccessPath.For((e)=>e.backgroundMonitoring.enabled))
    );

    render() {
        if (!this.props.displayable) {
            return null;
        }
        return <div className="Modal">
            <div className="ModalContent">
                <div className="IndiProperty">
                        Monitoring for: {this.props.title}
                </div>


                <div className="IndiProperty">
                    <Bool
                        accessor={this.activityMonitoringAccessor(this.props.uid)}
                        helpKey={SequenceMonitoringDialog.enableActivityMonitoringHelp}
                    /> No progress in sequence for more than

                    <Float
                        accessor={this.activityMonitoringDurationAccessor(this.props.uid)}
                        helpKey={SequenceMonitoringDialog.activityMonitoringDurationHelp}
                    /> seconds.
                </div>

                <div className="IndiProperty">
                    <Bool
                        accessor={this.fwhmMonitoringAccessor(this.props.uid)}
                        helpKey={SequenceMonitoringDialog.enableFwhmMonitoringHelp}
                    /> Evolution of FWHM accross lights images

                    <input type="button" value="..." {...SequenceMonitoringDialog.fwhmMonitoringSettingsHelp.dom()} onClick={this.showFwhmMonitoring}/>
                    <Modal ref={this.fwhmMonitoringModal}>
                        <SequenceStatMonitoringDialog
                                parameter="fwhm"
                                uid={this.props.uid}
                            />


                    </Modal>
                </div>

                <div className="IndiProperty">
                    <Bool
                        accessor={this.backgroundMonitoringAccessor(this.props.uid)}
                        helpKey={SequenceMonitoringDialog.enableBackgroundMonitoringHelp}
                    /> Evolution of background level accross images

                    <input type="button" value="..." {...SequenceMonitoringDialog.backgroundMonitoringSettingsHelp.dom()} onClick={this.showBackgroundMonitoring}/>
                    <Modal ref={this.backgroundMonitoringModal}>
                        settings...
                    </Modal>
                </div>

                <input type='button' value='Close' onClick={this.props.onClose} {...SequenceMonitoringDialog.closeBtonHelp.dom()}/>
            </div>
        </div>;
    }

    private showFwhmMonitoring=()=>{
        this.fwhmMonitoringModal!.current!.open();
        this.backgroundMonitoringModal!.current!.close();
    }

    private showBackgroundMonitoring=()=>{
        this.fwhmMonitoringModal!.current!.open();
        this.backgroundMonitoringModal!.current!.close();
    }

    static mapStateToProps:()=>(store: Store.Content, ownProps: InputProps)=>MappedProps=()=>{
        return (store: Store.Content, ownProps: InputProps)=> {
            const selected = ownProps.uid;
            const details = Utils.getOwnProp(store.backend.sequence?.sequences.byuuid, selected);
            if (details === undefined) {
                return {
                    displayable: false,
                    title: "not found",
                    activityMonitoring: {enabled: false},
                };
            }
            const { activityMonitoring, title } = {...details};
            return {
                displayable: true,
                activityMonitoring,
                title
            };
        }
    }
}

export default Store.Connect(SequenceMonitoringDialog);
