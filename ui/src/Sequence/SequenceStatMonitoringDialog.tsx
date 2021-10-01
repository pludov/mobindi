import * as React from 'react';
import { defaultMemoize } from 'reselect';

import { canonicalize } from 'json-canonicalize';
import { SequenceActivityMonitoring, SequenceStep, SequenceStepParameters, SequenceValueMonitoring } from '@bo/BackOfficeStatus';

import * as Utils from '../Utils';
import * as Help from '../Help';
import * as AccessPath from '../shared/AccessPath';
import * as Store from '../Store';
import * as SequenceStore from '../SequenceStore';
import * as BackendRequest from '../BackendRequest';
import TextEdit from "../TextEdit";
import * as SequenceStepParameter from "./SequenceStepParameter";
import CancellationToken from 'cancellationtoken';
import Bool from '@src/primitives/Bool';
import Float from '@src/primitives/Float';
import Modal from '@src/Modal';
import { SequenceLogic } from '@src/shared/SequenceLogic';
import { SequenceParamClassifier } from '@src/shared/SequenceParamClassifier';
import SequenceStateMonitoringClasseControl from './SequenceStateMonitoringClassControl';


type ParamSettings = {
    title: string;
    monitoringProp: "fwhmMonitoring"|"backgroundMonitoring";
    seuilHelp: Help.Key;
}

const titles: {[id: string]:ParamSettings} = {
    fwhm : {
        title: "Monitoring of FWHM",
        monitoringProp: "fwhmMonitoring",
        seuilHelp: Help.key("Allowed variation from reference FWHM")
    },
    background: {
        title: "Monitoring of background level",
        monitoringProp: "backgroundMonitoring",
        seuilHelp: Help.key("Allowed variation from reference background level", "Background level is mesured in 0-1 interval")
    },
}

type InputProps = {
    uid: string;
    parameter: "fwhm"|"background";
}

type MappedProps = {
    displayable: boolean;
    title: string;
    monitoringProp: ParamSettings["monitoringProp"];

    parameters: Array<string>;
}

type State = {}

type Props = InputProps & MappedProps;

class SequenceStatMonitoringDialog extends React.PureComponent<Props, State> {
    constructor(props:Props) {
        super(props);
        this.state = {
        };
    }

    private monitoringSettingsAccessor= defaultMemoize(
        (uid:string, prop:"backgroundMonitoring"|"fwhmMonitoring")=>
            SequenceStore.sequenceAccessor(uid).child(AccessPath.For((e)=>e[prop]))
    );

    private seuilAccessor = defaultMemoize(
        (uid:string, prop: "backgroundMonitoring"|"fwhmMonitoring")=>
            new Store.UndefinedToNullAccessor(
                this.monitoringSettingsAccessor(uid, prop).child(AccessPath.For((e)=>e.seuil))
            )
    );

    render() {
        if (!this.props.displayable) {
            return null;
        }
        return <span>
                <div className="IndiProperty">
                        {titles[this.props.parameter].title} - {this.props.title}
                </div>
                <div className="IndiProperty">
                        Max deviation from reference:
                        <Float
                            accessor={this.seuilAccessor(this.props.uid, this.props.monitoringProp)}
                            helpKey={titles[this.props.parameter].seuilHelp}
                        /> seconds.
                </div>
                <div className="IndiProperty">
                    <table>
                        <thead>
                            <tr>
                                <th>
                                </th>
                                <th>
                                    Status
                                </th>
                                <th>
                                    Ref.
                                </th>
                                <th>
                                    Last.
                                </th>
                           </tr>
                        </thead>
                        <tbody>
                            {this.props.parameters.map((jsc)=>
                                <SequenceStateMonitoringClasseControl
                                    key={jsc}
                                    monitoring={this.props.monitoringProp}
                                    parameter={this.props.parameter}
                                    classId={jsc}
                                    uid={this.props.uid}/>
                            )}
                        </tbody>
                    </table>
                </div>

        </span>;
    }

    static mapStateToProps:()=>(store: Store.Content, ownProps: InputProps)=>MappedProps=()=>{
        const parameters = defaultMemoize((root:SequenceStep)=> {
            const logic = new SequenceLogic({
                root,
                activityMonitoring: {enabled: false},
                fwhmMonitoring: {enabled: false, perClassStatus: {}},
                backgroundMonitoring: {enabled: false, perClassStatus: {}},
                errorMessage: null,
                imageStats: {},
                images: [],
                imagingSetup: null,
                progress: null,
                status: "idle",
                stepStatus: {},
                title: "",
            }, ()=>"");

            const classifier = new SequenceParamClassifier();
            logic.scanParameters((param)=> {
                classifier.addParameter(param);
            });

            return classifier.extractParameters().map(canonicalize);
        });
        return (store: Store.Content, ownProps: InputProps)=> {
            const selected = ownProps.uid;
            const monitoringProp = titles[ownProps.parameter].monitoringProp;
            const details = Utils.getOwnProp(store.backend.sequence?.sequences.byuuid, selected);
            if (details === undefined) {
                return {
                    monitoringProp,
                    displayable: false,
                    title: "not found",
                    activityMonitoring: {enabled: false},
                    parameters: []
                };
            }
            const { activityMonitoring, title } = {...details};
            return {
                monitoringProp,
                displayable: true,
                activityMonitoring,
                title,
                parameters: parameters(details.root),
            };
        }
    }
}

export default Store.Connect(SequenceStatMonitoringDialog);
