import * as React from 'react';
import { defaultMemoize } from 'reselect';

import { canonicalize } from 'json-canonicalize';
import { SequenceStep } from '@bo/BackOfficeStatus';

import * as Utils from '../Utils';
import * as Help from '../Help';
import * as AccessPath from '../shared/AccessPath';
import * as Store from '../Store';
import * as SequenceStore from '../SequenceStore';
import Float from '@src/primitives/Float';
import Int from '@src/primitives/Int';
import Modal from '@src/Modal';
import { SequenceLogic } from '@src/shared/SequenceLogic';
import { SequenceParamClassifier } from '@src/shared/SequenceParamClassifier';
import SequenceStateMonitoringClasseControl from './SequenceStateMonitoringClassControl';


type ParamSettings = {
    title: string;
    monitoringProp: "fwhmMonitoring"|"backgroundMonitoring";
    seuilHelp: Help.Key;
    evaluationCountHelp: Help.Key;
    evaluationPercentileHelp: Help.Key;
    learningCountHelp: Help.Key;
    learningPercentileHelp: Help.Key;
}

const titles: {[id: string]:ParamSettings} = {
    fwhm : {
        title: "Monitoring of FWHM",
        monitoringProp: "fwhmMonitoring",
        seuilHelp: Help.key("Allowed variation from reference FWHM"),
        evaluationPercentileHelp: Help.key("Evaluation percentile", "For evaluation, will consider the FWHM at this percentile. 0 is min, 1 is max, 0.5 is median"),
        evaluationCountHelp: Help.key("Evaluation count", "Use this amount of images for evaluation of the current FWHM. A percentile (parameterized median) is used to filter outliers."),
        learningPercentileHelp: Help.key("Evaluation percentile", "For learning, will consider the FWHM at this percentile. 0 is min, 1 is max, 0.5 is median"),
        learningCountHelp: Help.key("Learning count", "Use this amount of images for learning the reference FWHM. A percentile (parameterized median) is used to filter outliers."),
        },
    background: {
        title: "Monitoring of background level",
        monitoringProp: "backgroundMonitoring",
        seuilHelp: Help.key("Allowed variation from reference background level", "Background level is mesured in 0-1 interval"),
        evaluationPercentileHelp: Help.key("Evaluation percentile", "For evaluation, will consider the background value at this percentile. 0 is min, 1 is max, 0.5 is median"),
        evaluationCountHelp: Help.key("Evaluation count", "Use this amount of images for evaluation of the current background value. A percentile (parameterized median) is used to filter outliers."),
        learningPercentileHelp: Help.key("Evaluation percentile", "For learning, will consider the background value at this percentile. 0 is min, 1 is max, 0.5 is median"),
        learningCountHelp: Help.key("Learning count", "Use this amount of images for learning the reference background value. A percentile (parameterized median) is used to filter outliers."),
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

    private evaluationPercentileAccessor = defaultMemoize(
        (uid:string, prop: "backgroundMonitoring"|"fwhmMonitoring")=>
            new Store.UndefinedToNullAccessor(
                this.monitoringSettingsAccessor(uid, prop).child(AccessPath.For((e)=>e.evaluationPercentile))
            )
    );

    private evaluationCountAccessor = defaultMemoize(
        (uid:string, prop: "backgroundMonitoring"|"fwhmMonitoring")=>
            new Store.UndefinedToNullAccessor(
                this.monitoringSettingsAccessor(uid, prop).child(AccessPath.For((e)=>e.evaluationCount))
            )
    );

    private learningPercentileAccessor = defaultMemoize(
        (uid:string, prop: "backgroundMonitoring"|"fwhmMonitoring")=>
            new Store.UndefinedToNullAccessor(
                this.monitoringSettingsAccessor(uid, prop).child(AccessPath.For((e)=>e.learningPercentile))
            )
    );

    private learningCountAccessor = defaultMemoize(
        (uid:string, prop: "backgroundMonitoring"|"fwhmMonitoring")=>
            new Store.UndefinedToNullAccessor(
                this.monitoringSettingsAccessor(uid, prop).child(AccessPath.For((e)=>e.learningCount))
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
                        />.
                </div>
                <div className="IndiProperty">
                        Evaluate the last<Int
                            accessor={this.evaluationCountAccessor(this.props.uid, this.props.monitoringProp)}
                            helpKey={titles[this.props.parameter].evaluationCountHelp}
                        /> frames. Use the percentile
                        <Float
                            accessor={this.evaluationPercentileAccessor(this.props.uid, this.props.monitoringProp)}
                            helpKey={titles[this.props.parameter].evaluationPercentileHelp}
                        />
                        for median filtering.
                </div>
                <div className="IndiProperty">
                        Learn over <Int
                            accessor={this.learningCountAccessor(this.props.uid, this.props.monitoringProp)}
                            helpKey={titles[this.props.parameter].evaluationCountHelp}
                        /> frames.
                        Use the percentile
                        <Float
                            accessor={this.learningPercentileAccessor(this.props.uid, this.props.monitoringProp)}
                            helpKey={titles[this.props.parameter].evaluationPercentileHelp}
                        />
                        for median fitlering.
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
                fwhmMonitoring: {enabled: false, perClassStatus: {}, perClassSettings: {}, evaluationCount: 5, evaluationPercentile: 0.5, learningCount: 5, learningPercentile: 0.5},
                backgroundMonitoring: {enabled: false, perClassStatus: {}, perClassSettings: {}, evaluationCount: 5, evaluationPercentile: 0.5, learningCount: 5, learningPercentile: 0.5},
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
