import * as React from 'react';
import { defaultMemoize } from 'reselect';

import { SequenceImageParameters, SequenceStepParameters, SequenceValueMonitoringPerClassSettings, SequenceValueMonitoringPerClassStatus } from '@bo/BackOfficeStatus';

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
import Text from '@src/primitives/Text';


type InputProps = {
    // sequence
    uid: string;

    // Json string for the class
    classId: string;

    // The parameter
    parameter: "fwhm"|"background";
    monitoring: "fwhmMonitoring"|"backgroundMonitoring";
}

type MappedProps = {
    settingsList: string[];
    settingsValues: SequenceImageParameters;
    classStatus: SequenceValueMonitoringPerClassStatus;
    classSettings: SequenceValueMonitoringPerClassSettings;
}

type State = {}

type Props = InputProps & MappedProps;

class SequenceStatMonitoringClassControl extends React.PureComponent<Props, State> {

    constructor(props:Props) {
        super(props);
    }

    private monitoringSettingsAccessor = defaultMemoize(
        (uid:string, prop:"backgroundMonitoring"|"fwhmMonitoring")=>
            SequenceStore.sequenceAccessor(uid).child(AccessPath.For((e)=>e[prop]))
    );

    private perClassSettingsAccessor = defaultMemoize(
        (uid: string, prop:"backgroundMonitoring"|"fwhmMonitoring", jscId: string)=>
            this.monitoringSettingsAccessor(uid, prop).child(AccessPath.For((e)=>e.perClassSettings[jscId]))
    );

    private manualValueAccessor = defaultMemoize(
        (uid: string, prop:"backgroundMonitoring"|"fwhmMonitoring", jscId: string)=>
            new Store.UndefinedToNullAccessor(
                this.perClassSettingsAccessor(uid, prop, jscId).child(AccessPath.For((e)=>e.manualValue))
            )
    );

    render() {
        const status = this.props.classSettings.disable ? "disabled"
                : this.props.classSettings.manualValue !== undefined ? "manual"
                : this.props.classStatus.learningReady ? "learned" : "learning";

        return <tr>
            <td>
                {this.props.classId}
            </td>
            <td>
                {status}

                {status === 'learning' || status === 'learned' || status === 'manual'
                    ? <input type="button" value="disable"/>
                    : null
                }

                {status === 'learning' || status === 'learned'
                    ? <input type="button" value="re-learn"/>
                    : null
                }

                <input type="button" value="set"/>
                {status === 'manual' || status === 'disabled'
                    ? <input type="button" value="auto"/>
                    : null
                }
            </td>
            <td>
                <Float
                    accessor={this.manualValueAccessor(this.props.uid, this.props.monitoring, this.props.classId)}
                />
            </td>
            <td>
                {this.props.classStatus.lastValue}
            </td>
        </tr>;
    }

    static mapStateToProps:()=>(store: Store.Content, ownProps: InputProps)=>MappedProps=()=>{
        const parseJsc = defaultMemoize((jsc:string)=>{
            return JSON.parse(jsc) as SequenceStepParameters;
        });
        const parameterList = defaultMemoize((jsc:string)=> {
            const ssp = parseJsc(jsc);
            const classifier = new SequenceParamClassifier();
            return classifier.exposureParamsOrdered.filter(e=>Object.prototype.hasOwnProperty.call(ssp, e));
        });

        return (store: Store.Content, ownProps: InputProps)=> {
            const selected = ownProps.uid;
            const seqDef = Utils.getOwnProp(store.backend.sequence?.sequences.byuuid, selected);
            const classStatus:SequenceValueMonitoringPerClassStatus = Utils.getOwnProp(seqDef?.[ownProps.monitoring].perClassStatus, ownProps.classId) || SequenceLogic.emptyMonitoringClassStatus;
            const classSettings:SequenceValueMonitoringPerClassSettings = Utils.getOwnProp(seqDef?.[ownProps.monitoring].perClassSettings, ownProps.classId) || SequenceLogic.emptyMonitoringClassSettings;

            return {
                classStatus,
                classSettings,
                settingsList: parameterList(ownProps.classId),
                settingsValues: parseJsc(ownProps.classId),
            };
        }
    }
}

export default Store.Connect(SequenceStatMonitoringClassControl);
