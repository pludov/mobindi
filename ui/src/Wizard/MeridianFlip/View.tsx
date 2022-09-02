import React from 'react';
import Log from '../../shared/Log';
import '../../AstrometryView.css';
import * as Store from '../../Store';
import InitialConfirm from "./InitialConfirm";
import "../PolarAlignment/PolarAlignment.css";
import { createSelector, defaultMemoize } from 'reselect';
import ArrayReselect from '../../utils/ArrayReselect';
import StepDetails from './StepDetails';
import AstrometryBackendAccessor from '@src/AstrometryStore';
import SkyProjection from '../../SkyAlgorithms/SkyProjection';
import "./View.css";

const logger = Log.logger(__filename);

type InputProps = {};
type MappedProps = {
    stepList: string[];
    selectedScope: string|null;
    pierSide: any;
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
                <pre>{JSON.stringify(this.props.pierSide, null, 2)}</pre>
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
            (store: Store.Content)=> store.backend?.astrometry?.selectedScope || null,
            (store: Store.Content)=> {
                let pierSide: any = "truc";
                const scope = store.backend?.astrometry?.selectedScope || null;
                if (scope !== null) {
                    const tree = store.backend?.indiManager?.deviceTree;
                    if (tree && Object.prototype.hasOwnProperty.call(tree, scope)) {
                        const mount = tree[scope];
                        pierSide = SkyProjection.getMountPierSide(mount);
                    }
                }

                return pierSide;
            },
            (stepList: string[], selectedScope, pierSide)=>({stepList, selectedScope, pierSide})
        );
    }
}

export default Store.Connect(View);