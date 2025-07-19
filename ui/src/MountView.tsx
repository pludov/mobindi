import React from 'react';
import CancellationToken from 'cancellationtoken';
import Log from './shared/Log';
import './AstrometryView.css';
import AstrometrySettingsView from './AstrometrySettingsView';
import AstrometryWizardBaseView from './Wizard/BaseView';
import * as Store from './Store';
import * as IndiManagerStore from './IndiManagerStore';
import * as BackendRequest from "./BackendRequest";
import { AstrometryWizards } from '@bo/BackOfficeAPI';
import {default as PolarAlignementView} from "./Wizard/PolarAlignment/View";
import {default as MeridianFlipView} from "./Wizard/MeridianFlip/View";
import AstrometryStatusView from './AstrometryStatusView';
import ScopePanel from './ScopePanel';

const logger = Log.logger(__filename);

type InputProps = {}

type StaticPage = "settings" | "panel";

type ChildPage = {
    static: StaticPage,
    wizard: undefined,
} | {
    static: undefined,
    wizard: WizardId,
}

type MappedProps = {
    currentWizard: string|null;
}

type Props = InputProps & MappedProps;

type State = ChildPage;


type WizardDefinition = {
    title: string;
    start: () => Promise<void>;
    ui: () => React.ReactNode;
}

type WizardId = "polarAlignment" | "meridianFlip";

class AstrometryView extends React.PureComponent<Props, State> {
    constructor(props:Props) {
        super(props);
        this.state = { static: "panel", wizard: undefined };
    }

    /** Force opening settings when no scope is connected */
    static getDerivedStateFromProps(newProps:Props, state:State) {
        const hasWizard = (!!newProps.currentWizard);

        if (state.wizard && !hasWizard) {
            // Leave the wizard page.
            return { static: "panel" , wizard: undefined};
        } else if (!state.wizard && hasWizard) {
            // Enter the wizard page.
            return { static: undefined, wizard: newProps.currentWizard as keyof AstrometryWizards };
        } else if (state.wizard && hasWizard) {
            // Stay on the wizard page.
            if (newProps.currentWizard !== state.wizard) {
                // The wizard has changed, we need to update the state.
                return { static: undefined, wizard: newProps.currentWizard as keyof AstrometryWizards };
            }
            return undefined;
        } else {
            // No wizard, no static page, leave the state as is.
            return undefined;
        }
    }

    static mapStateToProps(store: Store.Content, ownProps: InputProps):MappedProps {
        const astrometry = store.backend.astrometry;
        if (astrometry === undefined) {
            return {
                currentWizard: null,
            }
        }

        return {
            currentWizard: astrometry.runningWizard?.id || null,
        };
    }

    static startWizard(id:keyof AstrometryWizards) {
        return async ()=> {
            await BackendRequest.RootInvoker("astrometry")(id)(CancellationToken.CONTINUE, {});
        };
    };

    readonly wizards: Record<WizardId, WizardDefinition> = {
        polarAlignment:
            {
                title: "Polar alignment",
                start: AstrometryView.startWizard("startPolarAlignmentWizard"),
                ui: () => <PolarAlignementView/>
            },
        meridianFlip:
            {
                title: "Meridian flip",
                start: AstrometryView.startWizard("startMeridianFlipWizard"),
                ui: () => <MeridianFlipView/>
            },
    };


    render() {
        console.log('AstrometryView render', this.state);
        if (this.state.static === "settings") {
            return <AstrometrySettingsView close={()=>this.setState({static: "panel", wizard: undefined})}/>;
        }

        if (this.state.static === "panel") {
            return <ScopePanel close={()=>this.setState({static: "settings", wizard: undefined})}/>;
        }

        if (this.state.wizard) {
            const wizard = this.wizards[this.state.wizard];
            if (!wizard) {
                logger.error(`Unknown wizard ${this.state.wizard}`);
                return null;
            }
            return <AstrometryWizardBaseView>
                {wizard.ui()}
            </AstrometryWizardBaseView>;
        }

        return null;
    }
}

export default Store.Connect(AstrometryView);