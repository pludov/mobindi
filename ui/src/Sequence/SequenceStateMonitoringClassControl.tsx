import * as React from 'react';
import { defaultMemoize } from 'reselect';

import { SequenceImageParameters, SequenceStepParameters, SequenceValueMonitoring, SequenceValueMonitoringPerClassSettings, SequenceValueMonitoringPerClassStatus } from '@bo/BackOfficeStatus';

import * as Utils from '../Utils';
import * as Help from '../Help';
import * as AccessPath from '../shared/AccessPath';
import * as Store from '../Store';
import * as SequenceStore from '../SequenceStore';
import * as BackendRequest from '../BackendRequest';
import CancellationToken from 'cancellationtoken';
import Bool from '@src/primitives/Bool';
import Float from '@src/primitives/Float';
import QuickBton from '@src/primitives/QuickBton';
import { SequenceLogic } from '@src/shared/SequenceLogic';
import { SequenceParamClassifier } from '@src/shared/SequenceParamClassifier';
import ToggleBton from '@src/primitives/ToggleBton';
import ProgressMeter from '@src/primitives/ProgressMeter';
import "./SequenceStateMonitoringClassControl.css";

type Scaler = {
    statToView:(n:number)=>number;
    viewToStat:(n:number)=>number;
};

type InputProps = {
    // sequence
    uid: string;

    // Json string for the class
    classId: string;

    // The parameter
    parameter: "fwhm" | "background";
    monitoring: "fwhmMonitoring" | "backgroundMonitoring";

    scaler?: Scaler;
}

type MappedProps = {
    enabled: boolean;
    isActive: boolean;
    settingsList: string[];
    settingsValues: SequenceImageParameters;
    monitoringSettings: SequenceValueMonitoring;
    classStatus: SequenceValueMonitoringPerClassStatus;
    classSettings: SequenceValueMonitoringPerClassSettings;
    accessors: AccessorFactory;
}

type State = {}

type Props = InputProps & MappedProps;


class AccessorFactory {
    monitoringSettings = defaultMemoize(
        (uid: string, prop: "backgroundMonitoring" | "fwhmMonitoring") =>
            SequenceStore.sequenceAccessor(uid).child(AccessPath.For((e) => e[prop]))
    );

    perClassSettings = defaultMemoize(
        (uid: string, prop: "backgroundMonitoring" | "fwhmMonitoring", jscId: string) =>
            this.monitoringSettings(uid, prop).child(AccessPath.For((e) => e.perClassSettings[jscId]))
    );

    perClassStatus = defaultMemoize(
        (uid: string, prop: "backgroundMonitoring" | "fwhmMonitoring", jscId: string) =>
            this.monitoringSettings(uid, prop).child(AccessPath.For((e) => e.perClassStatus[jscId]))
    );

    manualValue = defaultMemoize(
        (uid: string, prop: "backgroundMonitoring" | "fwhmMonitoring", jscId: string, scaler: Scaler) =>
            new Store.TransformAccessor<number | null, number | null>(
                new Store.UndefinedToNullAccessor(
                    this.perClassSettings(uid, prop, jscId).child(AccessPath.For((e) => e.manualValue))
                ),
                {
                    toStore: (e)=>(e === null ? e : scaler.viewToStat(e)),
                    fromStore: (e)=>(e=== null ? e : scaler.statToView(e)),
                }
            )
    );

    learningCount = defaultMemoize(
        (uid: string, prop: "backgroundMonitoring" | "fwhmMonitoring") =>
            this.monitoringSettings(uid, prop).child(AccessPath.For((e)=>e.learningCount))
    );

    learnedCount = defaultMemoize(
        (uid: string, prop: "backgroundMonitoring" | "fwhmMonitoring", jscId: string) =>
            this.perClassStatus(uid, prop, jscId).child(AccessPath.For((e)=>e.learnedCount))
    );

    evaluationCount = defaultMemoize(
        (uid: string, prop: "backgroundMonitoring" | "fwhmMonitoring") =>
            this.monitoringSettings(uid, prop).child(AccessPath.For((e)=>e.evaluationCount))
    );

    evaluatedCount = defaultMemoize(
        (uid: string, prop: "backgroundMonitoring" | "fwhmMonitoring", jscId: string) =>
            this.perClassStatus(uid, prop, jscId).child(AccessPath.For((e)=>e.currentCount))
    );

    resetLearning = defaultMemoize(
        (uid: string, prop: "backgroundMonitoring" | "fwhmMonitoring", jscId: string) =>
            new Store.TransformAccessor<number | undefined, boolean>(
                this.perClassSettings(uid, prop, jscId).child(AccessPath.For((e) => e.learningMinTime)),
                {
                    fromStore: ()=> {
                        return false;
                    },
                    toStore: (b:boolean):number|undefined => {
                        if (!b) throw "Unsupported";
                        const last = this.perClassStatus(uid, prop, jscId).fromStore(Store.getStore().getState())?.lastValueTime;
                        if (last === null) return undefined;
                        return last;
                    }
                })
    );

    refValueIsManual = defaultMemoize(
        (uid: string, prop: "backgroundMonitoring" | "fwhmMonitoring", jscId: string) =>
            new Store.TransformAccessor<number | undefined, boolean>(
                this.perClassSettings(uid, prop, jscId).child(AccessPath.For((e) => e.manualValue)),
                {
                    toStore: (b: boolean):number|undefined => {
                        if (!b) {
                            return undefined;
                        }
                        let v = this.perClassStatus(uid, prop, jscId).fromStore(Store.getStore().getState())?.learnedValue;
                        if (v === undefined || v === null) {
                            v = 0;
                        }
                        return v;
                    },
                    fromStore: (b: number|undefined)=> {
                        return b !== undefined;
                    },
                }
            )
    );

    refValue = defaultMemoize(
        (uid: string, prop: "backgroundMonitoring" | "fwhmMonitoring", jscId: string, scaler: Scaler|undefined) =>
            new Store.TransformAccessor<number | undefined, number | null>(
                this.perClassSettings(uid, prop, jscId).child(AccessPath.For((e) => e.manualValue)),
                {
                    toStore: (b: number|null) => {
                        if (b === null) return undefined;
                        return scaler ? scaler.viewToStat(b) : b;
                    },
                    fromStore: (b: number|undefined, s:Store.Content) => {
                        if (b === undefined) {
                            const status = this.perClassStatus(uid, prop, jscId).fromStore(s);
                            const learned = status?.learnedValue;
                            if (learned !== undefined && learned !== null) {
                                return scaler ? scaler.statToView(learned) : learned;
                            }
                            return null;
                        }
                        return scaler ? scaler.statToView(b) : b;
                    },
                }
            )
    );


    enabledStatus = defaultMemoize(
        (uid: string, prop: "backgroundMonitoring" | "fwhmMonitoring", jscId: string) =>
            new Store.TransformAccessor<boolean | undefined, boolean>(
                this.perClassSettings(uid, prop, jscId).child(AccessPath.For((e) => e.disable)),
                {
                    toStore: (b: boolean | undefined) => !b,
                    fromStore: (b: boolean) => !b
                }
            )
    );
}


export function exposureToString(exp: number) {
    if (exp >= 1 && Math.abs(parseFloat(exp.toFixed(0)) - exp) < 0.001) {
        return exp.toFixed(0) + "s";
    } else if (exp >=1 || ((exp >= 0.1 && Math.abs(parseFloat(exp.toFixed(1)) - exp) < 0.001))) {
        return exp.toFixed(1) + "s";
    } else {
        return (exp * 1000).toFixed(0) + "ms";
    }
}

class SequenceStatMonitoringClassControl extends React.PureComponent<Props, State> {
    private sequenceParamClassifier = new SequenceParamClassifier();

    constructor(props: Props) {
        super(props);
    }

    private resetLearning = async()=> {
        return await BackendRequest.RootInvoker("sequence")("resetStatMonitoringLearning")(
            CancellationToken.CONTINUE,
            {
                sequenceUid: this.props.uid,
                monitoring: this.props.monitoring,
                classId: this.props.classId,
            }
        );
    }

    private resetCurrent = async()=> {
        return await BackendRequest.RootInvoker("sequence")("resetStatMonitoringCurrent")(
            CancellationToken.CONTINUE,
            {
                sequenceUid: this.props.uid,
                monitoring: this.props.monitoring,
                classId: this.props.classId,
            }
        );
    }

    private classTitle = defaultMemoize((jcs:string)=> {
        const props = JSON.parse(jcs);
        const items = [];
        for(const key of this.sequenceParamClassifier.exposureParamsOrdered)
        {
            if (Utils.has(props, key)) {
                const v = props[key];
                let vstr: string;

                switch(key) {
                    case "exposure":
                        vstr = exposureToString(v);
                        break;
                    case "bin":
                        vstr = "bin" + v;
                        break;
                    case "iso":
                        vstr = v + "iso";
                        break;
                    default:
                        vstr = "" + v;
                }

                items.push(vstr);
            }
        }
        if (items.length === 0) {
            return "Frames";
        }
        return items.join(',');
    });

    render() {
        const digits = this.props.parameter === "fwhm" ? 2 : 0;

        const alert = this.props.classStatus.currentValue !== null &&
                      this.props.classStatus.maxAllowedValue != null &&
                    this.props.classStatus.currentValue > this.props.classStatus.maxAllowedValue;

        return <tr className={`SequenceStatMonitoringClassControl ${this.props.enabled ? "Enabled" : "Disabled"} ${this.props.isActive ? "Active": "Idle"}`}>
            <th>
                <div className="SequenceStatMonitoringClassControlCell">
                <Bool accessor={this.props.accessors.enabledStatus(this.props.uid, this.props.monitoring, this.props.classId)} />
                <span>{this.classTitle(this.props.classId)}</span>
                </div>
            </th>
            <td>
                <div className="SequenceStatMonitoringClassControlCell">
                <Float
                    accessor={this.props.accessors.refValue(this.props.uid, this.props.monitoring, this.props.classId, this.props.scaler)}
                    digits={digits}
                />
                {this.props.classSettings.manualValue ?
                    <ToggleBton
                        className="MonitoringUseLearnedValue"
                        accessor={this.props.accessors.refValueIsManual(this.props.uid, this.props.monitoring, this.props.classId)}
                        />
                :
                    <>
                        <ProgressMeter
                            current={this.props.accessors.learnedCount(this.props.uid, this.props.monitoring, this.props.classId)}
                            max={this.props.accessors.learningCount(this.props.uid, this.props.monitoring)}
                            className="LearningProgress"
                            />
                        <QuickBton
                            className="MonitoringResetLearning"
                            onClick={this.resetLearning}
                            />
                    </>
                }
                </div>
            </td>
            <td>
                <div className="SequenceStatMonitoringClassControlCell">
                    <span className="cameraSetting">
                        {this.props.classStatus.currentValue !== null
                            ? (this.props.scaler
                                ? this.props.scaler.statToView(this.props.classStatus.currentValue)
                                : this.props.classStatus.currentValue
                                ).toFixed(digits)
                            : "N/A"
                        }
                    </span>

                    <>
                        <ProgressMeter
                            current={this.props.accessors.evaluatedCount(this.props.uid, this.props.monitoring, this.props.classId)}
                            max={this.props.accessors.evaluationCount(this.props.uid, this.props.monitoring)}
                            className={`AcquisitionProgress ${alert? "alert": ""}`}
                            />
                        <QuickBton
                            className="MonitoringResetLearning"
                            onClick={this.resetCurrent}
                            />
                    </>

                </div>
            </td>
        </tr>;
    }

    static mapStateToProps: () => (store: Store.Content, ownProps: InputProps) => MappedProps = () => {
        const accessors = new AccessorFactory();

        const parseJsc = defaultMemoize((jsc: string) => {
            try {
                return JSON.parse(jsc) as SequenceStepParameters;
            } catch(error) {
                console.warn("Unable to parse: " + jsc, error);
                return {} as SequenceStepParameters;
            }
        });
        const parameterList = defaultMemoize((jsc: string) => {
            const ssp = parseJsc(jsc);
            const classifier = new SequenceParamClassifier();
            return classifier.exposureParamsOrdered.filter(e => Object.prototype.hasOwnProperty.call(ssp, e));
        });

        return (store: Store.Content, ownProps: InputProps) => {
            const selected = ownProps.uid;
            const seqDef = Utils.getOwnProp(store.backend.sequence?.sequences.byuuid, selected);
            const enabled = accessors.enabledStatus(ownProps.uid, ownProps.monitoring, ownProps.classId).fromStore(store);
            const classStatus: SequenceValueMonitoringPerClassStatus = Utils.getOwnProp(seqDef?.[ownProps.monitoring].perClassStatus, ownProps.classId) || SequenceLogic.emptyMonitoringClassStatus;
            const classSettings: SequenceValueMonitoringPerClassSettings = Utils.getOwnProp(seqDef?.[ownProps.monitoring].perClassSettings, ownProps.classId) || SequenceLogic.emptyMonitoringClassSettings;
            const monitoringSettings = accessors.monitoringSettings(ownProps.uid, ownProps.monitoring).fromStore(store);
            return {
                accessors,
                enabled,
                isActive: seqDef?.currentImageClass === ownProps.classId,
                classStatus,
                classSettings,
                monitoringSettings,
                settingsList: parameterList(ownProps.classId),
                settingsValues: parseJsc(ownProps.classId),
            };
        }
    }
}

export default Store.Connect(SequenceStatMonitoringClassControl);
