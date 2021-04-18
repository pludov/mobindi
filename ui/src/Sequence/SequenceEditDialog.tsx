import * as React from 'react';
import { defaultMemoize } from 'reselect';

import { Sequence, ImagingSetup } from '@bo/BackOfficeStatus';

import * as Utils from '../Utils';
import * as Help from '../Help';
import * as Store from '../Store';
import * as BackendRequest from '../BackendRequest';
import { atPath } from '../shared/JsonPath';
import TextEdit from "../TextEdit";
import * as SequenceStepParameter from "./SequenceStepParameter";
import SequenceStepEdit from "./SequenceStepEdit";
import CancellationToken from 'cancellationtoken';
import SequenceWarning from './SequenceWarning';
import EditableImagingSetupSelector from '../EditableImagingSetupSelector';


type InputProps = {
    currentPath: string;
    onClose: ()=>void;
}

type MappedProps = {
    displayable: boolean;
    uid?: string;
    details?: Sequence;
    imagingSetupId?: string|null;
    imagingSetup?: ImagingSetup;
    cameraCapacity: SequenceStepParameter.CameraCapacity;
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

        return <div className="Modal">
            <div className="ModalContent">
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
                                cameraCapacity={this.props.cameraCapacity}
                                sequenceUid={this.props.uid}
                                sequenceStepUidPath="[]"
                            />
                    :
                        null
                }

                <input type='button' value='Close' onClick={this.props.onClose} {...SequenceEditDialog.closeBtonHelp.dom()}/>
            </div>
        </div>;
    }

    static mapStateToProps:()=>(store: Store.Content, ownProps: InputProps)=>MappedProps=()=>{
        const cameraCapacitySelector = SequenceStepParameter.cameraCapacityReselect();
        return (store: Store.Content, ownProps: InputProps)=> {
            const selected = atPath(store, ownProps.currentPath);
            if (!selected) {
                return {
                    displayable: false,
                    cameraCapacity: {},
                };
            }
            const details = Utils.getOwnProp(store.backend.sequence?.sequences.byuuid, selected);
            if (details === undefined) {
                return {
                    displayable: false,
                    cameraCapacity: {},
                };
            }
            const imagingSetupId = details.imagingSetup;
            const imagingSetup = Utils.getOwnProp(store.backend.imagingSetup?.configuration.byuuid, imagingSetupId);
            if (imagingSetup === undefined) {
                return {
                    displayable: true,
                    details,
                    uid: selected,
                    imagingSetupId,
                    cameraCapacity: {},
                };
            }

            return {
                displayable: true,
                uid: selected,
                details: details,
                imagingSetup,
                imagingSetupId,
                cameraCapacity: imagingSetup.cameraDevice !== null ? cameraCapacitySelector(store, imagingSetup.cameraDevice) : {},
            };
        }
    }
}

export default Store.Connect(SequenceEditDialog);
