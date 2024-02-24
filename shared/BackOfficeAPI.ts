import * as jsonpatch from 'json-patch';

import * as ProcessorTypes from "./ProcessorTypes";
import { SequenceStep, SequenceDitheringSettings, SequenceForeach, SequenceStepParameters, SequenceFocuserSettings, Rectangle } from './BackOfficeStatus';
import { Json } from './Json';
import { Diff } from '../shared/JsonProxy';

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
    value: Json;
}

export type UpdateIndiVectorRequest = {
    dev: string;
    vec: string;
    children: {name:string, value:string}[]
}

export type IndiProfileAPI = {
    createProfile: (payload: {name: string})=>void;
    deleteProfile: (payload: {uid:string})=>void;
    updateProfile: (payload: {uid:string, name: string})=>void;
}

export type IndiAPI = IndiProfileAPI & {
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

export type PatchSequenceRequest = {
    sequenceUid: string,
    patch: Diff;
}

export type UpdateSequenceStepRequest = {
    sequenceUid: string;
    stepUidPath: string[];
    param: keyof SequenceStep;
    value?: string|number|boolean|null|SequenceForeach<keyof SequenceStepParameters>;
}

export type ResetStatMonitoringRequest = {
    sequenceUid: string;
    monitoring: "fwhmMonitoring" | "backgroundMonitoring";
    classId: string;
}

export type PatchSequenceStepRequest = {
    sequenceUid: string;
    stepUidPath: string[];
    patch: jsonpatch.OpPatch[];
}

export type UpdateSequenceStepDitheringRequest = {
    sequenceUid: string;
    stepUidPath: string[];
    dithering: boolean;
    settings?: Partial<SequenceDitheringSettings>;
}

export type UpdateSequenceStepFocuserRequest = {
    sequenceUid: string;
    stepUidPath: string[];
    focuser: boolean;
    settings?: Partial<SequenceFocuserSettings>;
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

export type ImagingSetupManagerAPI = {
    setDevice: (payload: {imagingSetupUuid: string, device: "cameraDevice"|"focuserDevice"|"filterWheelDevice", value: string|null})=>void;
    setName:(payload: {imagingSetupUuid: string, name: string})=>void;
    updateCurrentSettings: (payload: {imagingSetupUuid: string, diff: any})=>void;
}

export type FilterWheelAPI = {
    changeFilter: (payload: {filterWheelDeviceId: string, filterNumber?: number, filterId?: string, force?:boolean})=>boolean;
    abortFilterChange: (payload: {filterWheelDeviceId: string})=>void;
}

export type ImageFileInfo = {
    name: string;
    type: "image"|"dir";
    time: number|null;
}

export type CameraAPI = {
    shoot: (payload: {})=>ShootResult;
    stream: (stream: {loopExposure: boolean})=>void;
    setStreamCrop: (payload: {crop: null|Rectangle})=>void;
    abort: (payload: {})=>void;
    setCurrentImagingSetup:(payload: {imagingSetup: string|null})=>void;
    setDefaultImageLoadingPath:(payload: {defaultImageLoadingPath: string|null})=>void;
    getImageFiles:(payload: {path: string})=>Array<ImageFileInfo>;
    setCcdTempTarget: (payload: {deviceId: string, targetCcdTemp: number|null})=>void;
}

export type SequenceAPI = {
    newSequence: (payload: {})=>string;
    startSequence: (payload: {sequenceUid: string})=>void;
    stopSequence: (payload: {sequenceUid: string})=>void;
    resetSequence: (payload: {sequenceUid: string})=>void;
    dropSequence: (payload: {sequenceUid: string})=>void;
    updateSequence: (payload: UpdateSequenceRequest)=>void;
    patchSequence: (payload: PatchSequenceRequest)=>void;
    newSequenceStep: (payload: NewSequenceStepRequest)=>string[];
    patchSequenceStep: (payload: PatchSequenceStepRequest)=>void;
    updateSequenceStep: (payload: UpdateSequenceStepRequest)=>void;
    updateSequenceStepDithering: (payload: UpdateSequenceStepDitheringRequest)=>void;
    updateSequenceStepFocuser: (payload: UpdateSequenceStepFocuserRequest)=>void;
    moveSequenceSteps: (payload: MoveSequenceStepsRequest)=>void;
    deleteSequenceStep: (payload: DeleteSequenceStepRequest)=>void;
    resetStatMonitoringLearning: (payload: ResetStatMonitoringRequest)=>void,
    resetStatMonitoringCurrent: (payload: ResetStatMonitoringRequest)=>void,
}

export type ExposedNotificationRequest = {
    uuid: string;
}

export type CloseNotificationRequest = {
    uuid: string;
    result?: any;
}

export type NotificationAPI = {
    exposedNotification: (payload: ExposedNotificationRequest)=>void;
    closeNotification: (payload: CloseNotificationRequest)=>void;
}

export type AstrometryWizards = {
    startPolarAlignmentWizard: (payload:{})=>void;
    startMeridianFlipWizard: (payload:{})=>void;
}

export type FineSlewLearnRequest = {
    imagingSetup: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

export type FineSlewLearnContinueRequest = {
    imagingSetup: string;
}

export type FineSlewSendToRequest = {
    imagingSetup: string;
    x: number;
    y: number;
    targetX: number;
    targetY: number;
    width: number;
    height: number;
}

export type SlewDirection = "north"|"south"|"east"|"west";

export type SlewSwitchRequest = {
    direction : "north"|"south"|"east"|"west";
    release: boolean;
}

export type AstrometryAPI = AstrometryWizards & {
    setCurrentImagingSetup:(payload: {imagingSetup: string|null})=>void;
    updateCurrentSettings: (payload: {diff: any})=>void;
    compute: (payload: AstrometryComputeRequest)=>ProcessorTypes.AstrometryResult;
    cancel: (payload: {})=>void;
    setScope: (payload: {deviceId: string})=>void;
    goto: (payload:AstrometryGotoScopeRequest)=>void;
    sync: (payload:{})=>void;
    wizardQuit: (payload:{})=>void;
    wizardInterrupt: (payload:{})=>void;
    wizardNext: (payload:{})=>void;

    fineSlewStartLearning: (payload: FineSlewLearnRequest)=>void;
    fineSlewContinueLearning: (payload: FineSlewLearnContinueRequest)=>void;
    fineSlewSendTo: (payload: FineSlewSendToRequest)=>void;
    fineSlewAbortLearning: ()=>void;
    slew: (payload: SlewSwitchRequest) => void;
    abortSlew: ()=>void;
}

export type FocuserAPI = {
    setCurrentImagingSetup:(payload: {imagingSetup: string|null})=>void;
    focus: (payload: {})=>number;
    abort: (payload: {})=>void;
    sync: (payload: {imagingSetupUuid: string})=>void;
    adjust: (payload: {imagingSetupUuid: string})=>void;
}

export type ImageProcessorAPI = {
    compute: <K extends keyof ProcessorTypes.Request>
            (payload: Pick<ProcessorTypes.Request, K>)
                =>ProcessorTypes.Result[K];
}

export type PhdAPI = {
    connect: (payload: {})=>void;
    startLoop: (payload: {})=>void;
    startGuide: (payload: {})=>void;
    stopGuide: (payload: {})=>void;
    setExposure: (payload: {exposure: number})=>void;
    setLockPosition: (payload: { x: number, y:number, exact: boolean})=>void;
    findStar: (payload: {roi?: Array<number>})=>void;
    clearCalibration: (payload: {})=>void;
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
    notification: NotificationAPI;
    imagingSetupManager: ImagingSetupManagerAPI;
}