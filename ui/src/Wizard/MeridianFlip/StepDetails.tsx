import React from 'react';
import Collapsible from 'react-collapsible';
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

type State = {
}

class StepDetails extends React.PureComponent<Props, State> {
    constructor(props:Props) {
        super(props);
        this.state = {
            explicitOpenStatus: undefined
        }
    }

    render() {
        return <>
            {this.props.kind}
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