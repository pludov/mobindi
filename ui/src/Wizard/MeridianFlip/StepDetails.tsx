import React from 'react';
import Collapsible from 'react-collapsible';
import Log from '../../shared/Log';
import '../../AstrometryView.css';
import * as Store from '../../Store';
import { MeridianFlipStatus, MeridianFlipStep, MeridianFlipStepBase, PolarAlignStatus } from '@bo/BackOfficeStatus';
import "../PolarAlignment/PolarAlignment.css";

type InputProps = {
    id: string;
    opened?: boolean;
};

type MappedProps = MeridianFlipStep;

type Props = InputProps & MappedProps;

type State = {
    explicitOpenStatus: boolean|undefined;
}

const statusDesc: {[id: string] : string} = {
    "pending": "⚬",
    "running": "⚡",
    "interrupted": "⏸",
    "done": "✅",
    "failed": "❌",
    "skipped": "🚫"
};

class StepDetails extends React.PureComponent<Props, State> {
    constructor(props:Props) {
        super(props);
        this.state = {
            explicitOpenStatus: undefined
        }
    }

    switchOpen= () => {
        this.setState({
            explicitOpenStatus:
                this.state.explicitOpenStatus !== undefined
                    ? !this.state.explicitOpenStatus
                    : !this.props.opened
        });
    }

    render() {
        const open = (this.state.explicitOpenStatus !== undefined) ? this.state.explicitOpenStatus : !!this.props.opened;
        return <>
            <div className="MeridianFlipStepItem">
                <div className="MeridianFlipStepItemFirstRow">
                    <div className="MeridianFlipStepTitle">
                        <span className="MeridianFlipStepStatus">
                            {statusDesc[this.props.status]}
                        </span>
                        <span className="MeridianFlipStepTitle">
                            {this.props.title}
                        </span>
                        {this.props.error ?
                            <span className="MeridianFlipStepError">
                                {this.props.error}
                            </span>
                        : null }
                    </div>
                    <div className={ "MeridianFlipStepSeeMore "
                                        + (open ? " Open " : " Closed ")
                                        + (this.props.status === "pending" ? "Hidden": "") }
                            onClick={this.switchOpen}>
                    </div>
                </div>
                <Collapsible classParentString={"MeridianFlipCollapsible " + (open ? "ExtOpen" : "ExtClosed") + " Collapsible" }
                            open={open}
                            trigger=""
                            transitionTime={200}
                            lazyRender={true}>
                    Details goes here
                </Collapsible>
            </div>
        </>
    }

    static mapStateToProps(store: Store.Content, props: InputProps) {
        const steps = store.backend.astrometry?.runningWizard?.meridianFlip?.steps.byuuid||{};
        if (!Object.prototype.hasOwnProperty.call(steps, props.id)) {
            return {};
        }
        const {id, ...step} = steps[props.id];
        return step;
    }
}

export default Store.Connect(StepDetails);