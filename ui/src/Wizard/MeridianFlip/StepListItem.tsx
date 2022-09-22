import React from 'react';
import Collapsible from 'react-collapsible';
import Log from '../../shared/Log';
import '../../AstrometryView.css';
import * as Store from '../../Store';
import { MeridianFlipStatus, MeridianFlipStep, MeridianFlipStepBase, PolarAlignStatus } from '@bo/BackOfficeStatus';
import "../PolarAlignment/PolarAlignment.css";
import StepDetails from './StepDetails';

type InputProps = {
    id: string;
};

type MappedProps = Pick<MeridianFlipStep, "status"|"error"|"title"> & {
    opened?: boolean;
};

type Props = InputProps & MappedProps;

type State = {
    explicitOpenStatus: boolean|undefined;
    prevOpened?: boolean;
}

const statusDesc: {[id: string] : string} = {
    "pending": "⚬",
    "running": "⚡",
    "interrupted": "⏸",
    "done": "✅",
    "failed": "❌",
    "skipped": "🚫"
};

class StepListItem extends React.PureComponent<Props, State> {
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

    static getDerivedStateFromProps(newProps:Props, state:State) {
        if (newProps.opened != state.prevOpened) {

            if (state.explicitOpenStatus !== undefined) {
                return {
                    explicitOpenStatus: undefined,
                    prevOpened: newProps.opened
                }
            }
            return {
                prevOpened: newProps.opened
            }
        }
        return null;
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
                    <StepDetails id={this.props.id}/>
                </Collapsible>
            </div>
        </>
    }

    static mapStateToProps(store: Store.Content, props: InputProps) {
        const wizard = store.backend.astrometry?.runningWizard?.meridianFlip;
        const opened = wizard?.activeStep === props.id;
        const steps = wizard?.steps.byuuid||{};
        if (!Object.prototype.hasOwnProperty.call(steps, props.id)) {
            return {};
        }
        const {id, status, error, title} = steps[props.id];
        return {status, error, title, opened};
    }
}

export default Store.Connect(StepListItem);