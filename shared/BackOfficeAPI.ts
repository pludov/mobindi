import * as ProcessorTypes from "./ProcessorTypes";
import { ShootSettings } from './BackOfficeStatus';

export type ToolExecuterAPI = {
    startTool: (message:{uid: string})=>void;
}

export type AstrometryComputeRequest = {
    image: string;
    forceWide?: boolean;
}

export type AstrometryGotoScopeRequest = {
    // 0 - 360 degrees
    ra:number;
    // -90 - 90 degrees
    dec:number;
}

export type UpdateIndiDriverParamRequest = {
    driver: string;
    key: string;
    value: number|boolean|string;
}

export type UpdateIndiVectorRequest = {
    dev: string;
    vec: string;
    children: {name:string, value:string}[]
}

export type IndiAPI = {
    connectDevice: (payload: {device: string})=>void;
    disconnectDevice: (payload: {device: string})=>void;
    restartDriver: (payload: {driver: string})=>void;
    updateDriverParam: (payload: UpdateIndiDriverParamRequest)=>void;
    updateVector: (payload: UpdateIndiVectorRequest)=>void;
}

export type ShootResult = {
    uuid: string;
    path: string;
    device: string;
}

export type UpdateSequenceRequest = {
    sequenceUid: string;
    sequenceStepUid?: string;
    param: string;
    value: any;
}

export type MoveSequenceStepsRequest = {
    sequenceUid:string;
    sequenceStepUidList: string[];
}

export type DeleteSequenceStepRequest = {
    sequenceUid: string;
    sequenceStepUid: string;
}

export type CameraAPI = {
    shoot: (payload: {})=>ShootResult;
    abort: (payload: {})=>void;
    setCamera: (payload: {device: string})=>void;
    setShootParam: <K extends keyof ShootSettings>(payload: {key: K, value: ShootSettings[K]})=>void;
    newSequence: (payload: {})=>string;
    startSequence: (payload: {sequenceUid: string})=>void;
    stopSequence: (payload: {sequenceUid: string})=>void;
    resetSequence: (payload: {sequenceUid: string})=>void;
    dropSequence: (payload: {sequenceUid: string})=>void;
    updateSequence: (payload: UpdateSequenceRequest)=>void;
    newSequenceStep: (payload: {sequenceUid:string})=>string;
    moveSequenceSteps: (payload: MoveSequenceStepsRequest)=>void;
    deleteSequenceStep: (payload: DeleteSequenceStepRequest)=>void;
}

export type AstrometryWizards = {
    startPolarAlignmentWizard: (payload:{})=>void;
}

export type AstrometryAPI = AstrometryWizards & {
    updateCurrentSettings: (payload: {diff: any})=>void;
    compute: (payload: AstrometryComputeRequest)=>ProcessorTypes.AstrometryResult;
    cancel: (payload: {})=>void;
    setScope: (payload: {deviceId: string})=>void;
    goto: (payload:AstrometryGotoScopeRequest)=>void;
    sync: (payload:{})=>void;
    wizardQuit: (payload:{})=>void;
    wizardInterrupt: (payload:{})=>void;
    wizardNext: (payload:{})=>void;
}

export type FocuserAPI = {
    updateCurrentSettings: (payload: {diff: any})=>void;
    focus: (payload: {})=>number;
    abort: (payload: {})=>void;
}

export type ImageProcessorAPI = {
    compute: <K extends keyof ProcessorTypes.Request>
            (payload: Pick<ProcessorTypes.Request, K>)
                =>ProcessorTypes.Result[K];
}

export type PhdAPI = {
    connect: (payload: {})=>void;
    startGuide: (payload: {})=>void;
    stopGuide: (payload: {})=>void;
}

export type BackOfficeAPI = {
    toolExecuter: ToolExecuterAPI;
    astrometry : AstrometryAPI;
    focuser: FocuserAPI;
    indi: IndiAPI;
    camera: CameraAPI;
    imageProcessor: ImageProcessorAPI;
    phd: PhdAPI;
}