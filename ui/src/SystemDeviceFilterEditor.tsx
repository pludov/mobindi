/**
 * Created by ludovic on 21/07/17.
 */
import React, { ChangeEvent } from 'react';
import * as Store from "./Store";
import * as BackendRequest from "./BackendRequest";
import * as Help from './Help';
import CancellationToken from 'cancellationtoken';
import { IndiProfileConfiguration, IndiProfilesConfiguration } from '@bo/BackOfficeStatus';
import { defaultMemoize } from 'reselect';
import { SystemDeviceList, SystemDevicePartialList } from '@bo/BackOfficeAPI';
import Modal from './Modal';
import SystemDeviceFilterEditorModal from './SystemDeviceFilterEditorModal';
import { getIdentifierListFromFilter, StateFilter } from './SystemDeviceFilter';
import './SystemDeviceFilter.css';

type HandledProps = Pick<IndiProfileConfiguration, 'systemDeviceLogic' |'systemDeviceIdentifier'>;

type Props = HandledProps & {
    onChange: (e: HandledProps) => void,
}

type State = {
    systemDeviceIdentifier : Array<StateFilter>,
    systemDeviceLogic: IndiProfileConfiguration['systemDeviceLogic'],
    editing: boolean,
}

/**
 * Contain a set of filter in the form key: value
 */
export default class SystemDeviceFilterEditor extends React.PureComponent<Props, State> {
    private static editFilterHelp = Help.key("Edit system device logic", "Set/unset a dependency between this profile and a system device, so that the profile will get activated/deactivated automatically when some device is detected");
    private static discardHelp = Help.key("Discard", "Close the dialog without saving any change");
    private static applyHelp = Help.key("Apply", "Apply the change and close the dialog");

    constructor(props:Props) {
        super(props);
        this.state = {
            systemDeviceIdentifier: [],
            systemDeviceLogic: null,
            editing: false,
        };
    }

    openEditor=() => {

        this.setState({
            editing: true,
            systemDeviceIdentifier: getIdentifierListFromFilter(this.props.systemDeviceIdentifier),
            systemDeviceLogic: this.props.systemDeviceLogic,
        });
    }

    closeEditor=()=> {
        this.setState({editing: false, systemDeviceIdentifier: [], systemDeviceLogic:null });
    }

    updateSystemDevice=(e: Pick<State, 'systemDeviceIdentifier'|'systemDeviceLogic'>) => {
        this.setState(e);
    }

    apply = ()=> {
        if (!this.state.editing) {
            return;
        }
        const {systemDeviceIdentifier, systemDeviceLogic} = {...this.state};
        this.closeEditor();

        const payload: HandledProps = {
            systemDeviceLogic,
            systemDeviceIdentifier: {}
        }

        for(const e of systemDeviceIdentifier) {
            if (e.value !== undefined) {
                payload.systemDeviceIdentifier![e.key] = e.value;
            }
        }
        this.props.onChange(payload);
    }

    render() {
        const idents = getIdentifierListFromFilter(this.props.systemDeviceIdentifier);

        return (<>
                {this.state.editing
                    ? <Modal onClose={this.closeEditor}
                            forceVisible={true}
                            controlButtons={
                                <input type='button' value={SystemDeviceFilterEditor.applyHelp.title} onClick={this.apply} {...SystemDeviceFilterEditor.applyHelp?.dom()}/>
                            }
                            closeHelpKey={SystemDeviceFilterEditor.discardHelp}>
                        <SystemDeviceFilterEditorModal 
                            systemDeviceIdentifier={this.state.systemDeviceIdentifier}
                            systemDeviceLogic={this.state.systemDeviceLogic}
                            onChange={this.updateSystemDevice}
                            
                        />
                    </Modal>
                    : null
                }

                <div className="systemDeviceFilterView" style={{display: "inline-block", verticalAlign:"text-top"}}>
                    <div style={{float:"right", marginLeft:"0.5em"}}>
                        <input className="GlyphBton"
                            type='button' value='✏️'
                            onClick={this.openEditor}
                            {...SystemDeviceFilterEditor.editFilterHelp.dom()}
                            />
                    </div>
                    {this.props.systemDeviceLogic === null
                        ?
                            <div className="systemDeviceFilterViewLogic"><span>Disabled</span></div>
                        :
                            <>
                                <div className="systemDeviceFilterViewLogic">
                                    {this.props.systemDeviceLogic
                                    ? <span>When device is present:</span>
                                    : <span>When device is not present:</span>
                                    }
                                </div>
                                
                                <div>
                                    {idents.length !== 0
                                        ? <ul >
                                            {idents.map((i)=> <li key={i.key}>{ i.key}: {i.value}</li>)}
                                         </ul>
                                        : <div key={'none'}>*</div>
                                    }
                                </div>
                            </>
                    }
                </div>
                

            </>);
    }
}

