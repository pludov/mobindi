import { AstrometryResult } from "./ProcessorTypes";
import { IndiMessage } from "./IndiTypes";

export type FocuserPoint = {
    temp: number|null;
    filter: string|null;
    position: number;
}

export type ImagingSetupDynState = {
    curFocus: FocuserPoint|null;
    temperatureWarning: string|null;
    focuserWarning: string|null;
    // Focus related
    filterWheelWarning: string|null;
}

export type ImagingSetup = {
    name: string;
    cameraDevice: null|string;
    focuserDevice: null|string;
    filterWheelDevice: null|string;

    availableFilters: string[];
    cameraSettings: CameraDeviceSettings;
    focuserSettings: FocuserSettings;

    dynState: ImagingSetupDynState;
    refFocus: FocuserPoint|null;
}

export type CameraDeviceSettings = {
    prefix?:string;
    type?:string;
    bin?: number;
    exposure: number;
    iso?: null|string;
    ccdTemp?: null|number;
    path?: string;
}

export type CameraDeviceDynState = {
    spyRecommanded?: boolean;
    targetCcdTemp?: number|null;
};

export type DitheringSettings = {
    amount: number;
    raOnly: boolean;
    pixels: number;
    time: number;
    timeout: number;
};

export type SequenceDitheringSettings = DitheringSettings & {
    // If set, apply the dithering only on step entrance (whatever repeat, foreach are)
    once: boolean;
}

export type SequenceFocuserSettings = {
    once: boolean;
}

export type SequenceImageParameters = {
    exposure?:number;
    iso?: string;
    type?: string;
    bin?: number;
    filter?: string|null;
    ccdTemp?: number|null;
}

export type SequenceStepParameters = SequenceImageParameters & {
    dithering?: null|SequenceDitheringSettings;
    focuser?: null|SequenceFocuserSettings;
}

export type SequenceStep = SequenceStepParameters & {
    repeat?: number;

    // If both repeat and foreach are set, the foreach cycle "repeat" times
    foreach?: SequenceForeach<keyof SequenceStepParameters>;
    childs?: {
        list: string[];
        byuuid: {[uuid:string]:SequenceStep}
    };
}

export type SequenceForeachItem<K extends keyof SequenceStepParameters> = {
    [KEY in K]?: SequenceStepParameters[KEY]
};

export type SequenceForeach<K extends keyof SequenceStepParameters> = {
    param: K;
    list: string[];
    byuuid: {[uuid: string] : SequenceForeachItem<K>};
}

export type SequenceStepStatus = {
    /** Updated on each loop start */
    execUuid: string;
    parentExecUuid: string|null;
    /** Erased on each arrival */
    finishedLoopCount: number;
    /** Erased on each arrival / foreach increment */
    currentForeach: string|null;
    finishedForeach: {[id:string]: boolean} | null;
    activeChild?: string;
    lastDitheredExecUuid?: string;
}

export type ImageStats = SequenceImageParameters & {
    fwhm?: number;
    starCount?: number;
    guideStats?: PhdGuideStats;
    backgroundLevel?: number;
    arrivalTime: number;
}

export type SequenceValueMonitoringPerClassSettings = {
    disable?: boolean;
    manualValue?: number;

    // Don't account for image before that time during learning
    learningMinTime?: number;
    // Don't account for image before that time during evaluation
    evaluationMinTime?: number;
}

export type SequenceValueMonitoringPerClassStatus = {
    currentValue: number|null;
    currentCount: number;

    maxAllowedValue: number|null;

    lastValue: number|null;
    lastValueTime: number|null;

    learnedValue: number|null;
    learnedCount: number;

    learningReady: boolean;

}

export type SequenceValueMonitoring = {
    enabled: boolean;
    seuil?: number;

    evaluationCount: number;
    evaluationPercentile: number;
    learningCount: number;
    learningPercentile: number;
    perClassSettings: {[jcsConfig:string]: SequenceValueMonitoringPerClassSettings };
    perClassStatus: {[jcsConfig:string]: SequenceValueMonitoringPerClassStatus };
}

export type SequenceActivityMonitoring = {
    enabled: boolean;
    duration?: number;
}

export type Sequence = {
    status: "idle"|"running"|"paused"|"done"|"error";
    // The current image parameters (canonical jcs from SequenceClassiffier)
    currentImageClass?: string;
    progress: string | null;
    title: string;
    imagingSetup: string | null;
    errorMessage: string|null;
    count?:number;
    done?:boolean;

    root: SequenceStep;
    stepStatus: {[id: string]: SequenceStepStatus};

    fwhmMonitoring: SequenceValueMonitoring;
    backgroundMonitoring: SequenceValueMonitoring;
    activityMonitoring: SequenceActivityMonitoring;


    // uuids of images
    images: string [];
    storedImages?: Array<ImageStatus&ImageStats>;
    storedAstrometryRefImageId?: number|null;
    imageStats: {[uid:string]: ImageStats};
    astrometryRefImageUuid: string|null;
}

export type IndiMessageWithUid = IndiMessage & {
    uid: string;
};

export type FilterWheelDeltas = {[filterId:string]: number};

export type IndiDeviceConfiguration = {
    driver: string;
    config?: string;
    skeleton?: string;
    prefix?: string;
    options: {
        autoGphotoSensorSize?: boolean;
        disableAskCoverScope?: boolean;
        autoConnect?: boolean;
        confirmFilterChange?: boolean;
    };
};

export type IndiServerConfiguration = {
    path: null;
    libpath: null;
    fifopath: null;
    devices: {[id: string]: IndiDeviceConfiguration};
    autorun: boolean;
}

export type IndiProfilePropertyConfiguration = {
    value: string;
}

export type ProfilePropertyAssociation<T> ={
    [dev: string]: {
        [vec: string]: {
            // "...whole_vector..." is used for vector wide constraint
            [prop: string]: T
        }
    }
};


export type IndiProfileConfiguration = {
    uid: string;
    name: string;
    active: boolean;

    // Keys are Stringified of { dev, vec, prop }
    keys: ProfilePropertyAssociation<IndiProfilePropertyConfiguration>;
}

export type IndiProfilesConfiguration = {
    list: string[];
    byUid: {[uid:string]:IndiProfileConfiguration};
}

export type IndiServerState = IndiServerConfiguration & {
    restartList: string[];
    startDelay: {[id:string] : number};
};

export type IndiPropertyIdentifier = {
    device: string;
    vector: string;
    property: string;
}

export type IndiProperty = {
    $_: string;
    $name: string;
    $label: string;
    $format: string;
    $min?:string;
    $max?:string;
}

export type IndiVector = {
    $label: string;
    $type: "Number"|"Text"|"Switch"|"BLOB"|"Light",
    $perm: string;
    $rule: string;
    $group: string;
    $state: "Busy"|"Error"|"Ok"|"Idle"|"";
    $timestamp: string;
    $message: string;
    $rev: number;
    childNames: string[];
    childs: {
        [propId: string]: IndiProperty
    };
}

export type IndiDevice = {
    [vecId: string]: IndiVector
}

export type IndiManagerStatus = {
    status: "error"|"connecting"|"connected";
    configuration: {
        indiServer: IndiServerConfiguration;
        driverPath: string;
        profiles : IndiProfilesConfiguration;
    };
    driverToGroup: {[driver: string]: string};
    deviceTree: {[deviceId:string]:IndiDevice};
    availableCameras: string[];
    availableScopes: string [];
    availableFocusers: string[];
    availableFilterWheels: string[];
    profileStatus: {
        totalMismatchCount: number;
        mismatches: ProfilePropertyAssociation<{wanted: string, profile: string}>
    }
    messages: {
        byUid: {[uuid:string]:IndiMessageWithUid}
    };
}

export type IndiManagerSetPropertyRequest = {
    data: {
        dev: string;
        vec: string;
        children: {name:string, value:string}[]
    }
}

export type ImageStatus = {
    path: string;
    device: string;
    astrometry?: AstrometryResult;
}

export type CameraConfiguration = {
    defaultImagePath?: string;
    defaultImagePrefix?: string;
    fakeImages?: string[];
    fakeImagePath?: string;
    preferedImagingSetup: string | null;
};

export type StreamDetails = {
    width: number;
    height: number;
    color: boolean;
};

export type FrameSize = {
    width: number;
    height: number;
};

export type Rectangle = {
    x: number;
    y: number;
    w: number;
    h: number;
};

// When content is actually a subframe
// Gives actual margin in 0-1 range
export type SubFrame = {
    // Actual region that was shot
    x: number;
    y: number;
    w: number;
    h: number;

    // total region
    maxW: number;
    maxH: number;
};

export type CameraStream = {
    streamId: string|null;
    streamDetails: StreamDetails|null;
    serial: number|null;            // Really usefull ?
    autoexp: number|null;           // Trigger events or just wait
    frameSize: FrameSize|null;
    subframe: SubFrame|null;
    requestedCrop: Rectangle|null;
};

export type CameraShoot = {
    exposure: number;
    expLeft: number;
    managed: boolean;
    status: 'External'|'init'|'Downloading'|'Exposing';
} & Partial<CameraDeviceSettings>;

export type CameraStatus = {
    status: string;
    currentImagingSetup: string|null;
    defaultImageLoadingPath: string|null;
    currentStreams: {[deviceId: string]: CameraStream};
    currentShoots: {[deviceId:string]:CameraShoot};
    lastUuidByDevices: {[deviceId:string]:string};
    dynStateByDevices: {[deviceId: string] : CameraDeviceDynState};
    images: {
        list: string[];
        byuuid: {[uuid:string]:ImageStatus}
    };

    // FIXME: config
    configuration: CameraConfiguration;
}

export type SequenceStatus = {
    sequences: {
        list: string[],
        byuuid: {[uuid: string]:Sequence}
    };
}

export type NotificationItem = {
    title: string;
    time: number;

    // oneshot must be closed by ui as soon as displayed
    // dialog expect a result
    type: "oneshot"|"dialog";
    buttons: null | Array<
        {
            title: string;
            value: any;
        }
    >
}

export type NotificationStatus = {
    byuuid: {[uuid: string]: NotificationItem}
    list: string[];
}

export type FocuserSettings = {
    range: number;
    steps: number;
    backlash: number;
    lowestFirst : boolean;
    targetCurrentPos: boolean;
    targetPos: number;

    interruptGuiding: boolean;

    focuserFilterAdjustment: FilterWheelDeltas;
    temperatureProperty: null|IndiPropertyIdentifier;
    focusStepPerDegree: null|number;
    // Only move when the ideal distance is at least that distance away
    focusStepTolerance: number;
}

export type AutoFocusConfiguration = {
    preferedImagingSetup: string|null
};

export type AutoFocusStatus = {
    status: "idle"|"running"|"done"|"error"|"interrupted";
    imagingSetup: string|null;
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
    currentImagingSetup: string|null;
    config: AutoFocusConfiguration;
    // FIXME: must be turned into a imagingSetupUuid map
    current: AutoFocusStatus;
}

export type FilterWheelDynState = {
    targetFilterPos: number|null;
    currentFilterPos: number|null;
    filterIds: string[];
}

export type FilterSetting = {
    color: string|null;
}

export type FilterWheelStatus = {
    dynStateByDevices: {[deviceId: string] : FilterWheelDynState};
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

    polarAlign: PolarAlignSettings;
    meridianFlip: MeridianFlipSettings;
    fineSlew: FineSlewSettings;
    preferedScope: string|null;
    preferedImagingSetup: string|null;
}

export type PolarAlignSettings = {
    slewRate: string;
    sampleCount: number;
    angle: number;
    minAltitude: number;
    dyn_nextFrameIsReferenceFrame?: boolean;
}

export type MeridianFlipSettings = {
    clearPhdCalibration: boolean;
}

export type PolarAlignAxisResult = {
    alt: number;
    az: number;
    tooHigh: number;
    tooEast: number;
    distance: number;
}

export type PolarAlignPositionMessage = {
    message: string;
    warning: boolean;
}

export type PolarAlignStatus = {
    status: "initialConfirm"|"running"|"paused"|"adjusting"|"done";
    data: {
        [id: string]:{relRaDeg: number, dec: number}
    };

    // Valid for status running, pause, done
    fatalError: null|string;

    stepId: number;
    maxStepId: number;
    astrometrySuccess: number;
    astrometryFailed: number;
    shootDone: number;
    shootRunning: boolean;
    scopeMoving: boolean;
    astrometryRunning: boolean;

    axis?: null | PolarAlignAxisResult;
    hasRefFrame: boolean;

    adjustError: null|string;
    adjusting: null|"frame"|"refframe";

    adjustPositionMessage: null|PolarAlignPositionMessage;
    // When warning is not computed
    adjustPositionError: null|string;
}

export type MeridianFlipStepBase = {
    id: string;
    title: string;
    status: "pending"|"running"|"interrupted"|"done"|"failed"|"skipped";
    error?: string;
}

export type MeridianFlipGenericShootStep = MeridianFlipStepBase & {
    exposing?: boolean;
    resolving?: boolean;
    photo?: string;
    photoTime?: number;
    center?: {ra: number, dec: number};
}

export type MeridianFlipSuspendPhdStep = MeridianFlipStepBase & {
    kind: "suspendPhd";
};

export type MeridianFlipResumePhdStep = MeridianFlipStepBase & {
    kind: "resumePhd";
};

export type MeridianFlipSuspendSequenceStep = MeridianFlipStepBase & {
    kind: "suspendSequence";
};

export type MeridianFlipResumeSequenceStep = MeridianFlipStepBase & {
    kind: "resumeSequence";
};

export type MeridianFlipAcquireStep = MeridianFlipStepBase & MeridianFlipGenericShootStep & {
    kind: "presync";
};

export type MeridianFlipFlipMountStep = MeridianFlipStepBase & {
    kind: "flip";
};

export type MeridianFlipSyncStep = MeridianFlipStepBase & MeridianFlipGenericShootStep & {
    kind: "sync";
    retry: number;
};


export type MeridianFlipCorrectMountStep = MeridianFlipStepBase & {
    kind: "correct";
    retry: number;
};

export type MeridianFlipStep = MeridianFlipSuspendPhdStep | MeridianFlipResumePhdStep | MeridianFlipSuspendSequenceStep | MeridianFlipResumeSequenceStep | MeridianFlipAcquireStep | MeridianFlipFlipMountStep | MeridianFlipCorrectMountStep | MeridianFlipSyncStep;

export type MeridianFlipStatus = {
    activeStep: string|null;
    steps: {
        list: string[];
        byuuid: {[id:string]:MeridianFlipStep};
    }

    targetPosition?: {ra: number, dec: number};
}

export type AstrometryWizard = {
    id: string;
    title: string;

    paused: boolean;
    // Valid when !paused
    interruptible: boolean;
    // Valid when paused
    hasNext: null|string;

    polarAlignment?: PolarAlignStatus;

    meridianFlip?: MeridianFlipStatus;
}

export type SlewCalibrationVector = {
    northDuration: number;
    westDuration: number;
}

export type FineSlewLearning = {
    imagingSetup: string;
    // Unbinned coordinates of the current learning
    // TODO : make it relative
    //   - Store duration for whole image traversal (instead of pixel)
    //   - Display marks is bad only if bin is changed during calibration
    start: [number, number];
    end: [number, number];
    acquiredCount: number;

    frameSize: FrameSize;

    // MS slew duration (n, w) for one pixel (x or y dir)
    vectors: Array<SlewCalibrationVector>;
}

export type FineSlewLearned = {
    imagingSetup: string;

    frameSize: FrameSize;

    // MS slew duration (n, w) for one pixel (x or y dir)
    vectors: Array<SlewCalibrationVector>;
}

// Refer to the capability to point using slew without any GOTO
// Typically usefull during collimation, or daytime, on moon, ...
export type FineSlewStatus = {
    slewing: boolean;

    learning: null|FineSlewLearning;
    learned: null|FineSlewLearned;
}

export type FineSlewSettings = {
    slewRate: string;
}

export type AstrometryStatus = {
    status: "empty"|"error"|"computing"|"ready";
    scopeStatus: "idle"|"moving"|"syncing";
    scopeReady: boolean;
    scopeMovedSinceImage: boolean;
    scopeDetails: string | null;
    lastOperationError: string|null;
    image: string | null;
    imageUuid: string | null;
    result: AstrometryResult|null;
    selectedScope: string | null;
    settings: AstrometrySettings;
    // set during GOTOs
    target: {ra: number, dec:number}|null;

    // Set on first success (FIXME: should reset on camera change)
    narrowedField: number|null;
    // Set after one sync is ok (FIXME: should reset on mount/camera change)
    useNarrowedSearchRadius: boolean;

    runningWizard: null|AstrometryWizard;
    currentImagingSetup: string|null;

    fineSlew: FineSlewStatus;
}

export type ProcessConfiguration = {
    autorun: boolean;
    path: string| null;
    env: {[id:string]:string};
}

export type PhdConfiguration = ProcessConfiguration & {
    preferredDithering: DitheringSettings;
}

export type PhdGuideStep = {
    Timestamp: number;
    RADistanceRaw?: number,
    DECDistanceRaw?: number,
    RADistance?: number,
    DECDistance?: number,
    settling?: boolean;
    calibrating?: boolean;
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

export type PhdEquipmentStatus = {
    name: string;
    connected: boolean;
}

export type PhdServerChildConfiguration = {
    val?: string;
    props?: PhdServerConfiguration;
}

export type PhdServerConfiguration = {
    [id: string]: PhdServerChildConfiguration;
};

export type PhdGuideStats = {
    RADistanceRMS:number|null;
    DECDistanceRMS:number|null;
    RADECDistanceRMS:number|null;
    RADistancePeak: number|null;
    DECDistancePeak: number|null;
    RADECDistancePeak: number|null;
}

export type PhdStatus = PhdGuideStats & {
    phd_started: boolean;
    connected: boolean;
    AppState: PhdAppState;
    AppStateProgress: null|string;
    settling: PhdSettling|null;
    paused: boolean|null;
    /** Polled configuration from PHD */
    serverConfiguration: PhdServerConfiguration|null;
    guideSteps: {[id:string]: PhdGuideStep};
    configuration: PhdConfiguration;
    firstStepOfRun: string;
    star: PhdStar|null;
    currentEquipment: {
        camera?: PhdEquipmentStatus;
        mount?:PhdEquipmentStatus;
    };
    calibration: null|any;
    pixelScale: null|number;
    exposureDurations: Array<number>;
    exposure: null|number;
    lockPosition: null|{x: number, y:number};
    lastLockedPosition: null|{x: number, y:number};
    streamingCamera: string|null;
};

export type ImagingSetupStatus = {
    availableImagingSetups: string[];
    configuration: {
        byuuid: {[uuid:string]:ImagingSetup}
    }
};

export type ToolConfig = {
    desc?: string;
    hidden?: boolean;
    trigger?: "atstart";
    confirm?: string;
    cmd: string[];
};

export type ToolExecuterStatus = {
    tools: {[id:string]:ToolConfig};
};

export type TriggerConfig = {
    desc: string;
    device: string;
    vector: string;
    property: string[]|string;
    value: string[]|string;
}

export type TriggerExecuterStatus = {
    triggers: {[id:string]:TriggerConfig};
}

export type UIConfig = {
    // port available for direct image/video DL (bypass ssl)
    directPort: number;
}

export type BackofficeStatus = {
    apps: {[appId:string]: {enabled:boolean,position:number}};
    indiManager: IndiManagerStatus;
    camera: CameraStatus;
    imagingSetup: ImagingSetupStatus;
    sequence: SequenceStatus;
    filterWheel: FilterWheelStatus;
    astrometry: AstrometryStatus;
    focuser: FocuserStatus;
    phd: PhdStatus;
    toolExecuter: ToolExecuterStatus;
    triggerExecuter: TriggerExecuterStatus;
    notification: NotificationStatus;
    uiConfig: UIConfig;
};