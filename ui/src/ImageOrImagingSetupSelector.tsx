import * as React from 'react';

import * as Help from './Help';
import * as Store from "./Store";
import { defaultMemoize } from 'reselect';

import ImagingSetupSelector, {InputProps as ImagingSetupSelectorProps, Item as ImageSetupSelectorItem} from './ImagingSetupSelector';
import PromiseSelector, {Props as PromiseSelectorProps} from './PromiseSelector';
import ImagingSetupEditor from './ImagingSetupEditor';
import { BackendAccessor } from './utils/BackendAccessor';
import EditableImagingSetupSelector from './EditableImagingSetupSelector';
import Modal from './Modal';
import FitsFileChooser from './FitsFileChooser';


type Props = ImagingSetupSelectorProps & {
    loadedPath: string|undefined;
    onloadPath:(path:string|undefined)=>void;
    defaultPathAccessor: Store.Accessor<string|null>;
}

type State = {
    choosingFile: boolean;
};


class ImageOrImagingSetupSelector extends React.PureComponent<Props, State> {
    private readonly chooseImageControls: ImagingSetupSelectorProps["controls"];
    private modal = React.createRef<Modal>();

    constructor(props: Props) {
        super(props);
        this.chooseImageControls = [{
            id:'open image',
            title:'📁 Load image...',
            run: this.chooseFile
        }];
        this.state = {
            choosingFile: false
        };
    }

    chooseFile = async ()=> {
        this.setState({choosingFile: true});
        this.modal.current!.open();
    }

    closeChoose = (path?: string)=>{
        this.setState({choosingFile: false});
        if (path !== undefined) {
            this.props.onloadPath(path);
        }
    }

    /** Create an overriden accessor in state */
    private readonly overrideAccessor = defaultMemoize(
        (accessor:Props["accessor"])=>
            {
                if (!accessor) return accessor;

                return {
                    fromStore: accessor.fromStore,
                    send: (t:string|null)=> {
                        this.props.onloadPath(undefined);
                        return accessor.send(t);
                    }
                }
            }
    );

    private readonly valueOverride = defaultMemoize(
        (path: string| undefined)=>
            {
                if (path === undefined) return undefined;
                return {
                    id: path,
                    title: path
                }
            }
    );


    private readonly openFile=(path: string)=>{
        this.modal!.current!.close();
        this.props.onloadPath(path);
    }

    render(): React.ReactNode {
        const { controls, defaultPathAccessor, ...props} = this.props;
        props.accessor = this.overrideAccessor(props.accessor);
        return <>
            <EditableImagingSetupSelector
                            key="selector"
                            valueOverride={this.valueOverride(this.props.loadedPath)}
                            controls={this.chooseImageControls} {...props}/>
            <Modal ref={this.modal}>
                <FitsFileChooser chooseCb={this.openFile} defaultPathAccessor={defaultPathAccessor}/>
            </Modal>
        </>
    }
}

export default ImageOrImagingSetupSelector;
