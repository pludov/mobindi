import React from 'react';
import Log from '../../shared/Log';
import '../../AstrometryView.css';
import * as Store from '../../Store';
import InitialConfirm from "./InitialConfirm";
import "../PolarAlignment/PolarAlignment.css";
import { createSelector, defaultMemoize } from 'reselect';
import ArrayReselect from '../../utils/ArrayReselect';
import StepDetails from './StepDetails';

const logger = Log.logger(__filename);

type InputProps = {};
type MappedProps = {
    stepList: string[];
}

type Props = InputProps & MappedProps;

class View extends React.PureComponent<Props> {
    constructor(props:Props) {
        super(props);
        this.state = {}
    }

    render() {
        return <>
            <div className="MeridianFlipStepTable">
                {this.props.stepList.map(
                    (id)=>
                        <StepDetails key={id} id={id}/>
                )}
            </div>
            <InitialConfirm/>
        </>
    }

    static mapStateToProps:()=>(store: Store.Content, props: InputProps)=>MappedProps=()=> {
        const stepListSelector = ArrayReselect.createArraySelector(
                    (store: Store.Content, ownProps:InputProps)=>(store.backend.astrometry?.runningWizard?.meridianFlip?.steps.list||[]));

        return createSelector(
            stepListSelector,
            (stepList: string[])=>({stepList})
        );
    }
}

export default Store.Connect(View);