import { AstrometryResult } from "./ProcessorTypes";
import { IndiMessage } from "./IndiTypes";

export type ShootSettings = {
    prefix?:string;
    type?:string;
}

export type ShootResult = {
    uuid: string;
    path: string;
    device: string;
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
    // uuids of images
    images: string [];
    storedImages?: ImageStatus[];
}

export type IndiMessageWithUid = IndiMessage | {
    uid: string;
};

export type IndiDeviceConfiguration = {
    driver: string;
    config?: string;
    skeleton?: string;
    prefix?: string;
    options: {[id:string]:string};
};

export type IndiServerConfiguration = {
    path: null;
    fifopath: null;
    devices: {[id: string]: IndiDeviceConfiguration};
    autorun: boolean;
}

export type IndiServerState = IndiServerConfiguration & {
    restartList: string[];
};

export type IndiManagerStatus = {
    status: "error"|"connecting"|"connected";
    configuration: {
        indiServer: IndiServerConfiguration;
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

export type ImageStatus = {
    path: string;
    device: string;
}

export type CameraStatus = {
    status: string;
    selectedDevice: string | null;
    preferedDevice: string | null;
    availableDevices: string [];
    currentSettings: any;
    currentShoots: {[deviceId:string]:any};
    lastByDevices: {[deviceId:string]:string};
    images: {
        list: string[];
        byuuid: {[uuid:string]:ImageStatus}
    };

    sequences: {
        list: string[],
        byuuid: {[uuid: string]:Sequence}
    };
    configuration: any;
}

export type AutoFocusSettings = {
    range: number;
    steps: number;
    backlash: number;
    lowestFirst : boolean;
    targetCurrentPos: boolean;
    targetPos: number;
};

export type AutoFocusStatus = {
    status: "idle"|"running"|"done"|"error"|"interrupted";
    error: null|string;
    firstStep: null|number;
    lastStep: null|number;
    points: {[id:string]:{fwhm: number|null}};
    predicted: {[id:string]:{fwhm: number}};
    targetStep: null|number;
}

export type FocuserUpdateCurrentSettingsRequest = {
    diff: any
}

export type FocuserStatus = {
    selectedDevice: string|null;
    preferedDevice: string|null;
    availableDevices: string[];
    currentSettings: AutoFocusSettings;
    current: AutoFocusStatus;
}

export type AstrometrySettings = {
    initialFieldMin: number;
    initialFieldMax: number;

    // Use scope position when available
    useMountPosition: boolean;
    // When useScopePosition is true (else, 180°)
    initialSearchRadius: number|null;

    // Used after a successfull sync
    narrowedSearchRadius: number|null;
    // Used after a successfull search
    narrowedFieldPercent: number;
}

export type AstrometryStatus = {
    status: "empty"|"error"|"computing"|"ready";
    scopeStatus: "idle"|"moving"|"syncing";
    scopeReady: boolean;
    scopeMovedSinceImage: boolean;
    scopeDetails: string | null;
    lastOperationError: string|null;
    image: string | null;
    result: AstrometryResult|null;
    availableScopes: string [];
    selectedScope: string | null;
    settings: AstrometrySettings;
    // set during GOTOs
    target: {ra: number, dec:number}|null;

    // Set on first success (FIXME: should reset on camera change)
    narrowedField: number|null;
    // Set after one sync is ok (FIXME: should reset on mount/camera change)
    useNarrowedSearchRadius: boolean;
}

export type ProcessConfiguration = {
    autorun: false;
    path: string| null;
    env: {[id:string]:string};
}

export type PhdGuideStep = {
    Timestamp: null;
    RADistanceRaw?: number,
    DECDistanceRaw?: number,
    settling?: boolean;
}


export type PhdSettling = {
    running: boolean;
    status?: boolean;
    error?: any;
}

export type PhdStar = {
    SNR: number;
    StarMass: number;
}

export type PhdAppState ="NotConnected" | "Guiding" | "Paused" | "Calibrating" | "Looping" | "Stopped" | "LostLock"; 

export type PhdStatus = {
    phd_started: boolean;
    connected: boolean;
    AppState: PhdAppState;
    settling: PhdSettling|null;
    guideSteps: {[id:string]: PhdGuideStep};
    configuration: ProcessConfiguration;
    firstStepOfRun: string;
    RADistanceRMS:number|null;
    DECDistanceRMS:number|null;
    RADECDistanceRMS:number|null;
    RADistancePeak: number|null;
    DECDistancePeak: number|null;
    RADECDistancePeak: number|null;
    star: PhdStar|null;
};


export type AstrometryComputeRequest = {
    image: string;
    forceWide: boolean;
}

export type AstrometryCancelRequest = {
}

export type AstrometrySetScopeRequest = {
    deviceId: string;
}

export type AstrometrySyncScopeRequest = {
}

export type AstrometryGotoScopeRequest = {
    // 0 - 360 degrees
    ra:number;
    // -90 - 90 degrees
    dec:number;
}

export type BackofficeStatus = {
    apps: {[appId:string]: {enabled:boolean,position:number}};
    indiManager: IndiManagerStatus;
    camera: CameraStatus;
    astrometry: AstrometryStatus;
    focuser: FocuserStatus;
    phd: PhdStatus;
};