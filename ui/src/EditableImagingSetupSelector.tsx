import * as React from 'react';

import * as Help from './Help';
import * as Store from "./Store";

import ImagingSetupSelector, {InputProps as ImagingSetupSelectorProps, Item as ImageSetupSelectorItem} from './ImagingSetupSelector';
import PromiseSelector, {Props as PromiseSelectorProps} from './PromiseSelector';
import ImagingSetupEditor from './ImagingSetupEditor';
import * as BackendRequest from "./BackendRequest";

import Modal from './Modal';
import CancellationToken from 'cancellationtoken';
import { defaultMemoize } from 'reselect';

type Props = ImagingSetupSelectorProps;
type State = {
    // null when editing while no imaging setup is selected
    editingUuid: string | null | undefined;
    confirmDeleteImagingSetup: string | undefined;
};

function arraySwallowEquals(a1:Array<any>, a2:Array<any>|undefined) {
    if (!(a1 && a2)) {
        return false;
    }
    if (a1.length !== a2.length) {
        return false;
    }
    for(let i = 0 ; i < a1.length; ++i) {
        if (a1[i] !== a2[i]) {
            return false;
        }
    }
    return true;
}

class EditableImagingSetupSelector extends React.PureComponent<Props, State> {
    private static imaginSetupSelectorHelp = Help.key("Imaging setup", "Select your imaging configuration. This includes camera and related equipments like filterwheel, focuser, ... You can use the Edit option to choose/configure devices of this setup");
    private static deleteImagingSetupBtonHelp = Help.key("Delete", "Delete an imaging setup configuration. Undo is not possible");
    private static cancelDeleteBtonHelp = Help.key("Cancel", "Cancel the deletion of the imaging setup");
    private static confirmDeleteBtonHelp = Help.key("Delete", "Delete the imaging setup");

    private readonly controls : ImagingSetupSelectorProps["controls"];
    private readonly addNewControls : ImagingSetupSelectorProps["controls"];
    private prevControls : ImagingSetupSelectorProps["controls"] = [];

    private deleteImagingSetupConfirmDialog = React.createRef<Modal>();
    private readonly imagingSetupSelectorRef = React.createRef<PromiseSelector<ImageSetupSelectorItem>>();

    constructor(props: Props) {
        super(props);
        this.controls = [{
            id:'edit',
            title:'✏️ Edit...',
            run: this.startEdit
        }];

        this.addNewControls = [{
            id: 'create',
            title: '✏️ New...',
            run: this.createNew,
        }];
        this.state = {
            editingUuid: undefined,
            confirmDeleteImagingSetup: undefined,
        };
    }

    createNew = async() => {
        let newUid = await BackendRequest.RootInvoker("imagingSetupManager")("newImagingSetup")(
            CancellationToken.CONTINUE,
            {
                name: 'New imaging setup'
            }
        );

        this.setState({editingUuid: newUid});
    }

    startEdit = async ()=> {

        const current = this.props.accessor.fromStore(Store.getStore().getState()) || null;
        this.setState({editingUuid: current});
    }

    getCurrentEditing = ()=>{
        if (this.state.editingUuid === undefined) {
            throw new Error("not editing");
        }
        return this.state.editingUuid;
    }

    setCurrentEditing = async (uid: string|null)=> {
        this.setState({editingUuid: uid});
    }

    currentImagingSetupAccessor = defaultMemoize((str: string|null): Store.Accessor<string|null> => {
        return {
            fromStore: ()=> str,
            send: this.setCurrentEditing,
        }
    })

    closeEdit = ()=>{
        let editedUuid = this.state.editingUuid;
        if (editedUuid !== undefined && editedUuid !== null) {
            const current = this.imagingSetupSelectorRef.current;
            console.log('current is ', current);
            this.imagingSetupSelectorRef.current?.select(editedUuid);
        }
        this.setState({editingUuid: undefined});
    }

    deleteImagingSetup = async() => {
        const imagingSetupUuid = this.state.confirmDeleteImagingSetup;
        if (imagingSetupUuid === null || imagingSetupUuid === undefined) {
            return;
        }
        await BackendRequest.RootInvoker("imagingSetupManager")("deleteImagingSetup")(
            CancellationToken.CONTINUE,
            {
                imagingSetupUuid
            });
        this.setState({confirmDeleteImagingSetup: undefined, editingUuid: null});
        this.deleteImagingSetupConfirmDialog.current!.close();
    }

    confirmDeleteImagingSetup = (t: string|null) => {
        if (t === null) {
            return;
        }
        console.log('Going to drop', t);
        this.setState({confirmDeleteImagingSetup: t},
            ()=>this.deleteImagingSetupConfirmDialog.current!.open());
    }

    render() {
        const { controls, ...props} = this.props;

        let childControls : ImagingSetupSelectorProps["controls"] = [...(this.controls||[]), ...(this.props.controls||[])];
        if (arraySwallowEquals(childControls, this.prevControls)) {
            childControls = this.prevControls;
        } else {
            this.prevControls = childControls;
        }

        const editingUuid = this.state.editingUuid;
        return (
            <>
                {editingUuid !== undefined
                    ?
                        <Modal forceVisible={true} onClose={this.closeEdit}>

                            <Modal ref={this.deleteImagingSetupConfirmDialog}
                                closeHelpKey={EditableImagingSetupSelector.cancelDeleteBtonHelp}
                                closeOnChange={this.state.confirmDeleteImagingSetup}
                                controlButtons={
                                    <input type="button"
                                        onClick={(e)=>this.deleteImagingSetup()}
                                        value={EditableImagingSetupSelector.confirmDeleteBtonHelp.title}
                                        {...EditableImagingSetupSelector.confirmDeleteBtonHelp.dom()}>
                                    </input>
                                }>
                                <div>
                                    Do you really want to delete the profile
                                    &nbsp;

                                    <i>
                                        {this.state.confirmDeleteImagingSetup}
                                    </i> ?
                                </div>
                            </Modal>

                            <p>Imaging setup: <ImagingSetupSelector
                                    controls={this.addNewControls}
                                    accessor={this.currentImagingSetupAccessor(editingUuid)}/>
                                <input className="GlyphBton"
                                    type='button' value='❌'
                                    disabled={editingUuid === null}
                                    onClick={()=>this.confirmDeleteImagingSetup(editingUuid)}
                                    {...EditableImagingSetupSelector.deleteImagingSetupBtonHelp.dom()}
                                    />
                            </p>
                            {editingUuid !== null
                                ? <ImagingSetupEditor imagingSetupUid={editingUuid}/>
                                : null
                            }
                        </Modal>
                    : null
                }
                <ImagingSetupSelector controls={childControls} ref={this.imagingSetupSelectorRef as any} {...props}></ImagingSetupSelector>
            </>
        );
    }

}

export default EditableImagingSetupSelector;
