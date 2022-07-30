import * as React from 'react';
import { defaultMemoize } from 'reselect';

import { Sequence, ImagingSetup } from '@bo/BackOfficeStatus';

import * as Utils from '../Utils';
import * as Help from '../Help';
import * as Store from '../Store';
import * as BackendRequest from '../BackendRequest';
import { atPath } from '../shared/JsonPath';
import TextEdit from "../TextEdit";
import Modal from '../Modal';
import * as SequenceStepParameter from "./SequenceStepParameter";
import SequenceStepEdit from "./SequenceStepEdit";
import CancellationToken from 'cancellationtoken';
import SequenceWarning from './SequenceWarning';
import EditableImagingSetupSelector from '../EditableImagingSetupSelector';


type InputProps = {
    uid: string;
    onClose: ()=>void;
}

type MappedProps = {
    displayable: boolean;
    details?: Sequence;
    imagingSetupId?: string|null;
    imagingSetup?: ImagingSetup;
    imagingSetupCapacity: SequenceStepParameter.ImagingSetupCapacity;
}

type Props = InputProps & MappedProps;

type State = {
    runningMoves: number;
    overridenList: null | string[];
    overridenListSource: null | string[];
    AddStepBusy?: boolean;
}

class SequenceEditDialog extends React.PureComponent<Props, State> {
    private static titleHelp = Help.key("title", "Enter the title of the sequence. File for captured frames will be named according to the title");
    private static closeBtonHelp = Help.key("Close", "Return to the sequence list. Changes are saved as they are made.");

    constructor(props:Props) {
        super(props);
        this.state = {
            runningMoves: 0,
            overridenList: null,
            overridenListSource: null
        };
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

    private readonly getCurrentImagingSetupAccessor = defaultMemoize((uid:string):Store.Accessor<string|null>=> {
        return {
            fromStore: (store)=> {
                    const v = Utils.getOwnProp(store.backend.sequence?.sequences?.byuuid, this.props.uid)?.imagingSetup
                    return v !== undefined ? v : null;
                },
            send: (e)=>this.updateSequenceParam('imagingSetup', e),
        }
    });

    render() {
        if (!this.props.displayable || this.props.details === undefined || this.props.uid === undefined) {
            return null;
        }

        return <Modal onClose={this.props.onClose} closeHelpKey={SequenceEditDialog.closeBtonHelp} forceVisible={true}
                    title={<div className="Title">Edit sequence {this.props.details.title}</div>}
            >
                <div className="IndiProperty">
                        Title:
                        <TextEdit
                            value={this.props.details.title}
                            helpKey={SequenceEditDialog.titleHelp}
                            onChange={(e)=>this.updateSequenceParam('title', e)} />
                </div>
                <SequenceWarning uid={this.props.uid}/>
                <div className="IndiProperty">
                        Imaging setup:
                        <EditableImagingSetupSelector
                            accessor={this.getCurrentImagingSetupAccessor(this.props.uid)}
                        />
                </div>

                {this.props.imagingSetup && this.props.imagingSetupId
                    ?
                        <SequenceStepEdit
                                allowRemove={false}
                                imagingSetup={this.props.imagingSetup}
                                imagingSetupId={this.props.imagingSetupId}
                                imagingSetupCapacity={this.props.imagingSetupCapacity}
                                sequenceUid={this.props.uid}
                                sequenceStepUidPath="[]"
                            />
                    :
                        null
                }
            </Modal>;
    }

    static mapStateToProps:()=>(store: Store.Content, ownProps: InputProps)=>MappedProps=()=>{
        const imagingSetupCapacitySelector = SequenceStepParameter.imagingSetupCapacityReselect();
        return (store: Store.Content, ownProps: InputProps)=> {
            const selected = ownProps.uid;
            const details = Utils.getOwnProp(store.backend.sequence?.sequences.byuuid, selected);
            if (details === undefined) {
                return {
                    displayable: false,
                    imagingSetupCapacity: {},
                };
            }
            const imagingSetupId = details.imagingSetup;
            const imagingSetup = Utils.getOwnProp(store.backend.imagingSetup?.configuration.byuuid, imagingSetupId);
            if (imagingSetup === undefined) {
                return {
                    displayable: true,
                    details,
                    imagingSetupId,
                    imagingSetupCapacity: {},
                };
            }

            return {
                displayable: true,
                details: details,
                imagingSetup,
                imagingSetupId,
                imagingSetupCapacity: imagingSetupId !== null ? imagingSetupCapacitySelector(store, imagingSetupId) : {},
            };
        }
    }
}

export default Store.Connect(SequenceEditDialog);
