import React from 'react';
import CancellationToken from 'cancellationtoken';
import './AstrometryView.css';
import AstrometrySettingsView from './AstrometrySettingsView';
import AstrometryWizardBaseView from './Wizard/BaseView';
import * as Store from './Store';
import * as IndiManagerStore from './IndiManagerStore';
import * as BackendRequest from "./BackendRequest";
import { AstrometryWizards } from '@bo/BackOfficeAPI';
import {default as PolarAlignementView} from "./Wizard/PolarAlignment/View";

type InputProps = {}

type MappedProps = {
    hasValidScope: boolean;
    currentWizard: string|null;
    canStartWizard: boolean;
}

type Props = InputProps & MappedProps;

type State = {
    showPropsRequired: boolean;
    showProps: boolean;
}

class AstrometryView extends React.PureComponent<Props, State> {
    constructor(props:Props) {
        super(props);
        this.state = {showPropsRequired: false, showProps: false}
    }

    /** Force opening settings when no scope is connected */
    static getDerivedStateFromProps(newProps:Props, state:State) {
        const showPropsRequired = (!newProps.hasValidScope && newProps.currentWizard === null);
        if (state.showPropsRequired !== showPropsRequired) {
            // On force le visible en cas de changement

            return {
                showProps: state.showProps || showPropsRequired,
                showPropsRequired
            }
        }
        return {};
    }

    static mapStateToProps(store: Store.Content, ownProps: InputProps):MappedProps {
        const astrometry = store.backend.astrometry;
        if (astrometry === undefined) {
            return {
                hasValidScope: false,
                currentWizard: null,
                canStartWizard: false,
            }
        }

        const ret : MappedProps = {
            hasValidScope: astrometry.selectedScope !== null
                            && IndiManagerStore.hasConnectedDevice(store, astrometry.selectedScope),
            currentWizard: null,
            canStartWizard: false,
        }
        if (astrometry.runningWizard !== null) {
            ret.currentWizard = astrometry.runningWizard.id;
        } else {
            ret.canStartWizard = astrometry.status !== "computing" || astrometry.scopeStatus === "idle";
        }

        return ret;
    }

    showSettings=()=> {
        this.setState({showProps: true});
    }
    closeSettings=()=>{
        this.setState({showProps: false});
    }

    static startWizard(id:keyof AstrometryWizards) {
        return async ()=> {
            await BackendRequest.RootInvoker("astrometry")(id)(CancellationToken.CONTINUE, {});
        };
    };

    readonly wizards = [
        {
            title: "Polar alignment",
            start: AstrometryView.startWizard("startPolarAlignmentWizard")
        }
    ];

    wizardUi(id: string) {
        switch(id) {
            case "polarAlignment":
                return <PolarAlignementView/>;
            default:
                console.log('unknown wizard', id);
                return null;
        }
    }

    render() {
        return <div className="CameraView">
            { this.state.showProps
                ? <AstrometrySettingsView close={this.closeSettings} />
                : this.props.currentWizard === null
                    ?
                        /* Welcome screen */
                        <div>
                            <div className="AstrometryWizardSelectTitle">Astrometry</div>

                            <input type="button" value="Settings" className="AstrometryWizardSelectButton" onClick={this.showSettings}/>
                            {this.wizards.map(e=>
                                <input type="button"
                                        value={e.title}
                                        className="AstrometryWizardSelectButton"
                                        onClick={e.start}
                                />
                            )}

                        </div>
                    :
                    <AstrometryWizardBaseView showSettings={this.showSettings}>{this.wizardUi(this.props.currentWizard)}</AstrometryWizardBaseView>
            }
        </div>;
    }
}

export default Store.Connect(AstrometryView);