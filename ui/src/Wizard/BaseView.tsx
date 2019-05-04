import React from 'react';
import CancellationToken from 'cancellationtoken';
import '../AstrometryView.css';
import AstrometrySettingsView from '../AstrometrySettingsView';
import * as Store from '../Store';
import * as IndiManagerStore from '../IndiManagerStore';
import * as BackendRequest from "../BackendRequest";
import { AstrometryWizards } from '@bo/BackOfficeAPI';
import "./BaseView.css";

type InputProps = {
    showSettings : ()=>(void);
}

type MappedProps = {
    interruptible: boolean;
    paused: boolean;
    hasNext: string | null;
    title: string;
}

type Props = InputProps & MappedProps;

type State = {
}

class BaseView extends React.PureComponent<Props, State> {
    quit = async ()=> {
        await BackendRequest.RootInvoker("astrometry")("wizardQuit")(CancellationToken.CONTINUE, {});
    }

    interrupt = async ()=> {
        await BackendRequest.RootInvoker("astrometry")("wizardInterrupt")(CancellationToken.CONTINUE, {});
    }

    next = async ()=> {
        await BackendRequest.RootInvoker("astrometry")("wizardNext")(CancellationToken.CONTINUE, {});
    }

    render() {
        return <div className="AstrometryWizardRootView">
                    <div className="AstrometryWizardContent">
                        <div className="AstrometryWizardSelectTitle">{this.props.title}</div>
                        {this.props.children}
                    </div>

                    <div className="AstrometryWizardControls">
                        {this.props.paused
                            ? <input type="button" value="Quit"
                                    onClick={this.quit}
                                    className={this.props.hasNext ? "WizardLeftButton" : "WizardRightButton"}
                                    />
                            : <input type="button" value="Stop"
                                    disabled={!this.props.interruptible}
                                    onClick={this.interrupt}
                                    className="WizardLeftButton"
                                    />
                        }

                        {this.props.hasNext
                            ? <input type="button" value={this.props.hasNext} onClick={this.next} className="WizardRightButton"
                            />
                            : null
                        }
                    </div>
        </div>
    }

    static mapStateToProps(store: Store.Content, ownProps: InputProps):MappedProps {
        const astrometry = store.backend.astrometry;
        if (astrometry === undefined || astrometry.runningWizard === null) {
            return {
                interruptible: false,
                paused: false,
                hasNext: null,
                title: "",
            }
        }

        return {
            interruptible: astrometry.runningWizard.interruptible,
            paused: astrometry.runningWizard.paused,
            hasNext: astrometry.runningWizard.hasNext,
            title: astrometry.runningWizard.title,
        }
    }
}

export default Store.Connect(BaseView);