import * as ProcessorTypes from "./ProcessorTypes";

export type ToolExecuterAPI = {
    $api_startTool: (message:{uid: string})=>void;
}

export type AstrometryComputeRequest = {
    image: string;
    forceWide: boolean;
}

export type AstrometryGotoScopeRequest = {
    // 0 - 360 degrees
    ra:number;
    // -90 - 90 degrees
    dec:number;
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

export type BackOfficeAPI = {
    toolExecuter: ToolExecuterAPI;
    astrometry : AstrometryAPI;
    focuser: FocuserAPI;
}