export type ShootSettings = {
    prefix?:string;
}

export type ShootResult = {
    path: string;
}

export type Sequence = {
    status: string;
    title: string;
    camera: string | null;
    errorMessage: string|null;
    count?:number;
    done?:boolean;
    steps: {
        list: string[];
        byuuid: {[uuid:string]:any}
    }
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