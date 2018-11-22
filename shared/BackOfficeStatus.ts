import { AstrometryResult } from "./ProcessorTypes";
import { IndiMessage } from "./IndiTypes";

export type ShootSettings = {
    prefix?:string;
    type?:string;
}

export type ShootResult = {
    path: string;
}

export type Sequence = {
    status: "idle"|"running"|"paused"|"done"|"error";
    progress: string | null;
    title: string;
    camera: string | null;
    errorMessage: string|null;
    count?:number;
    done?:boolean;
    steps: {
        list: string[];
        byuuid: {[uuid:string]:any}
    };
}

export type IndiMessageWithUid = IndiMessage | {
    uid: string;
};

export type IndiManagerStatus = {
    status: "error"|"connecting"|"connected";
    configuration: {
        indiServer: any;
        driverPath: string;
    };
    driverToGroup: {[driver: string]: string};
    deviceTree: {[deviceId:string]:any}
    messages: {
        byUid: {[uuid:string]:IndiMessageWithUid}
    };
}

export type IndiManagerConnectDeviceRequest = {
    device: string;
}

export type IndiManagerDisconnectDeviceRequest = {
    device: string;
}

export type IndiManagerSetPropertyRequest = {
    data: {
        dev: string;
        vec: string;
        children: {name:string, value:string}[]
    }
}

export type IndiManagerRestartDriverRequest = {
    driver: string;
}

export type IndiManagerUpdateDriverParamRequest = {
    driver: string;
    key: string;
    value: string;
}

export type CameraStatus = {
    status: string;
    selectedDevice: string | null;
    preferedDevice: string | null;
    availableDevices: string [];
    currentSettings: any;
    currentShoots: {[deviceId:string]:any};
    images: {
        list: string[];
        byuuid: {[uuid:string]:any}
    };

    sequences: {
        list: string[],
        byuuid: {[uuid: string]:Sequence}
    };
    configuration: any;
}

export type AstrometryStatus = {
    status: "empty"|"error"|"computing"|"syncing"|"moving"|"ready";
    errorDetails: string  | null,
    image: string | null;
    result: AstrometryResult|null;
}


export type AstrometryComputeRequest = {
    image: string;
}

export type AstrometryCancelRequest = {
}


export type BackofficeStatus = {
    apps: {[appId:string]: {enabled:boolean,position:number}};
    indiManager: IndiManagerStatus;
    camera: CameraStatus;
    astrometry: AstrometryStatus;
};