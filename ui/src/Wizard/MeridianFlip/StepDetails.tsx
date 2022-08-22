import React from 'react';
import Log from '../../shared/Log';
import '../../AstrometryView.css';
import * as Store from '../../Store';
import { MeridianFlipStatus, MeridianFlipStep, MeridianFlipStepBase, PolarAlignStatus } from '@bo/BackOfficeStatus';
import "../PolarAlignment/PolarAlignment.css";

type InputProps = {
    id: string;
};

type MappedProps = MeridianFlipStep;

type Props = InputProps & MappedProps;

const statusDesc: {[id: string] : string} = {
    "pending": "⚬",
    "running": "⚡",
    "interrupted": "⏸",
    "done": "✅",
    "failed": "❌",
    "skipped": "🚫"
};

class StepDetails extends React.PureComponent<Props> {
    constructor(props:Props) {
        super(props);
        this.state = {}
    }

    render() {
        return <div className="MeridianFlipStepItem">
            <span className="MeridianFlipStepStatus">
                {statusDesc[this.props.status]}
            </span>
            <span className="MeridianFlipStepTitle">
                {this.props.title}
            </span>
        </div>
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