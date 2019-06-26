import * as ProcessorTypes from "./ProcessorTypes";
import { CameraDeviceSettings, SequenceStep } from './BackOfficeStatus';

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

export type NewSequenceStepRequest = {
    sequenceUid:string;
    stepUidPath: string[];
    removeParameterFromParent?: keyof SequenceStep;
    count?: number;
}

export type UpdateSequenceRequest = {
    sequenceUid: string;
    param: string;
    value: any;
}

export type UpdateSequenceStepRequest = {
    sequenceUid: string;
    stepUidPath: string[];
    param: keyof SequenceStep;
    value?: string|number|boolean|null;
}

export type MoveSequenceStepsRequest = {
    sequenceUid:string;
    stepUidPath: string[];
    childs: string[];
}

export type DeleteSequenceStepRequest = {
    sequenceUid: string;
    stepUidPath: string[];
    stepUid: string;
}

export type FilterWheelAPI = {
    changeFilter: (payload: {cameraDeviceId?: string, filterWheelDeviceId?: string, filterNumber?: number, filterId?: string, force?:boolean})=>boolean;
    abortFilterChange: (payload: {filterWheelDeviceId: string})=>void;
    setFilterWheel: (payload: {cameraDeviceId: string, filterWheelDeviceId: string|null})=>void;
}

export type CameraAPI = {
    shoot: (payload: {})=>ShootResult;
    abort: (payload: {})=>void;
    setCamera: (payload: {device: string})=>void;
    setShootParam: <K extends keyof CameraDeviceSettings>(payload: {camera?: string, key: K, value: CameraDeviceSettings[K]})=>void;
}

export type SequenceAPI = {
    newSequence: (payload: {})=>string;
    startSequence: (payload: {sequenceUid: string})=>void;
    stopSequence: (payload: {sequenceUid: string})=>void;
    resetSequence: (payload: {sequenceUid: string})=>void;
    dropSequence: (payload: {sequenceUid: string})=>void;
    updateSequence: (payload: UpdateSequenceRequest)=>void;
    newSequenceStep: (payload: NewSequenceStepRequest)=>string[];
    updateSequenceStep: (payload: UpdateSequenceStepRequest)=>void;
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
    setCurrentCamera:(payload: {cameraDevice: string})=>void;
    setCurrentFocuser:(payload: {focuserDevice: string, cameraDevice?: string})=>void;
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
    sequence: SequenceAPI;
    filterWheel: FilterWheelAPI;
    imageProcessor: ImageProcessorAPI;
    phd: PhdAPI;
}