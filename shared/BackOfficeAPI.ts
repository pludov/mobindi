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

export type IndiAPI = {
    connectDevice: (payload: {device: string})=>void;
    disconnectDevice: (payload: {device: string})=>void;
    updateDriverParam: (payload: UpdateIndiDriverParamRequest)=>void;
}

export type ShootResult = {
    uuid: string;
    path: string;
    device: string;
}

export type CameraAPI = {
    shoot: (payload: {})=>ShootResult;
    abort: (payload: {})=>void;
    setCamera: (payload: {device: string})=>void;
    setShootParam: <K extends keyof ShootSettings>(payload: {key: K, value: ShootSettings[K]})=>void;
}

export type AstrometryAPI = {
    updateCurrentSettings: (payload: {diff: any})=>void;
    compute: (payload: AstrometryComputeRequest)=>ProcessorTypes.AstrometryResult;
    cancel: (payload: {})=>void;
    setScope: (payload: {deviceId: string})=>void;
    goto: (payload:AstrometryGotoScopeRequest)=>void;
    sync: (payload:{})=>void;
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