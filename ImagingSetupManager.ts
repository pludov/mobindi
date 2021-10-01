import CancellationToken from 'cancellationtoken';
import Log from './Log';
import {BackofficeStatus, FocuserSettings, ImagingSetup, ImagingSetupStatus } from './shared/BackOfficeStatus';
import { ExpressApplication, AppContext } from "./ModuleBase";
import {IdGenerator} from "./IdGenerator";
import ConfigStore from './ConfigStore';
import JsonProxy, { TriggeredWildcard } from './shared/JsonProxy';
import * as Obj from "./shared/Obj";
import * as RequestHandler from "./RequestHandler";
import * as BackOfficeAPI from "./shared/BackOfficeAPI";

const logger = Log.logger(__filename);

export class ImagingSetupInstance {

    private readonly manager: ImagingSetupManager;
    public readonly uid: string|null;

    constructor(manager: ImagingSetupManager, uid:string|null) {
        this.manager = manager;
        this.uid = uid;
    }


    readonly config :()=>ImagingSetup = ()=> {
        if (this.uid === null) {
            throw new Error("No imaging setup selected");
        }
        return this.manager.getByUuid(this.uid);
    }

    exists() {
        if (this.uid === null) {
            return false;
        }
        const byuuid = this.manager.currentStatus.configuration.byuuid;
        if (!Obj.hasKey(byuuid, this.uid)) {
            return false;
        }
        return true;
    }
}

type StoredConfiguration = Omit<ImagingSetupStatus["configuration"], "byuuid"> & {
    byuuid:{[uuid:string]:Omit<ImagingSetup, "dynState">};
};


export default class ImagingSetupManager
        implements RequestHandler.APIAppProvider<BackOfficeAPI.ImagingSetupManagerAPI> {

    appStateManager: JsonProxy<BackofficeStatus>;

    currentStatus: ImagingSetupStatus;
    context: AppContext;
    get indiManager() { return this.context.indiManager };
    get imageProcessor() { return this.context.imageProcessor };

    idGenerator = new IdGenerator("0000000000000000");

    constructor(app:ExpressApplication, appStateManager:JsonProxy<BackofficeStatus>, context:AppContext) {
        this.appStateManager = appStateManager;
        this.appStateManager.getTarget().imagingSetup = {
            availableImagingSetups: [],
            configuration: {
                byuuid: {}
            }
        };

        // Device => promise
        this.currentStatus = this.appStateManager.getTarget().imagingSetup;
        this.context = context;

        new ConfigStore<ImagingSetupStatus["configuration"], StoredConfiguration>(appStateManager, 'imagingSetup', ['imagingSetup', 'configuration'], {
            byuuid: {}
        }, {
            byuuid: {}
        }, (c)=>{
            const ret : ImagingSetupStatus["configuration"] = {byuuid:{}};
            for(const uuid of Object.keys(c.byuuid)) {
                const imagingSetup = {...c.byuuid[uuid], dynState: this.defaultDynState()};
                // Ensure compatibility
                if (!imagingSetup.cameraSettings) {
                    imagingSetup.cameraSettings = this.defaultCameraSettings();
                }

                if (!imagingSetup.focuserSettings) {
                    imagingSetup.focuserSettings = this.defaultFocuserSettings();
                } else {
                    imagingSetup.focuserSettings = this.updateFocuserSettings(imagingSetup.focuserSettings);
                }
                ret.byuuid[uuid] = imagingSetup;
            }
            return ret;
        },
            (c: ImagingSetupStatus["configuration"])=> {
                const ret: StoredConfiguration = {byuuid: {}};
                for(const uuid of Object.keys(c.byuuid)) {
                    const {dynState, ...stored} = c.byuuid[uuid];

                    ret.byuuid[uuid] = stored;
                }
                return ret;
            }
        );

        // Update configuration/dyn states
        this.appStateManager.addSynchronizer(
            [ 'indiManager', 'availableCameras' ],
            this.initDefaultImageSetups,
            true);
        
        this.appStateManager.addSynchronizer(
            ['imagingSetup', 'configuration', 'byuuid'],
            this.updateAvailableImagingSetups,
            true);

        // TODO: Add synchronizer for available filters per filterwheel (so report filterwheel when set)
    }

    // currentPath: a json synchronizer path that match current properties.
    createPreferredImagingSelector(params: {
            currentPath: string[],
            preferedPath: string[],
            read: ()=>{prefered: string|null, current: string|null},
            set: (s:{prefered?: string|null|undefined, current?: string|null|undefined})=>void
        })
    {
        const update = ()=> {
            const status = params.read();
            const available = this.currentStatus.availableImagingSetups;

            let newCurrent: string|null|undefined;
            let newPrefered: string|null|undefined;

            if (status.current !== null) {
                if (available.indexOf(status.current) === -1) {
                    newCurrent = null;
                    status.current = null;
                } else {
                    if (status.prefered !== status.current) {
                        newPrefered = status.current;
                    }
                }
            }
            if (status.current === null) {
                if (status.prefered !== null && available.indexOf(status.prefered) !== -1) {
                    newCurrent = status.prefered;
                    status.current = newCurrent;
                }
            }
            if (newCurrent !== undefined || newPrefered !== undefined) {
                params.set({current: newCurrent, prefered: newPrefered});
            }
        };

        this.appStateManager.addSynchronizer(
            [
                [
                    [ 'imagingSetup', 'availableImagingSetups' ],
                    params.currentPath,
                    params.preferedPath,
                ]
            ],
            update,
            true
        );
        this.appStateManager.addSynchronizer(
            [
                'filterWheel', 'dynStateByDevices', null, 'filterIds'
            ],
            this.updateFilterWheelAvailableFilters,
            true,
            true
        );
    }

    private updateFilterWheelAvailableFilters = (where: TriggeredWildcard)=>{
        const imagingSetupByUuid = this.currentStatus.configuration.byuuid;
        for(const filterWheelId of Object.keys(where)) {
            for(const imagingSetupUid of Object.keys(imagingSetupByUuid)) {
                if (imagingSetupByUuid[imagingSetupUid].filterWheelDevice === filterWheelId) {
                    this.updateFilters(imagingSetupUid, false);
                }
            }
        }
    }

    private readonly updateAvailableImagingSetups=()=>
    {
        this.currentStatus.availableImagingSetups = Object.keys(this.currentStatus.configuration.byuuid).sort();
    }

    updateFilters(imagingSetupUuid: string, reset?:boolean)
    {
        const setup = this.getByUuid(imagingSetupUuid);
        let newFilters = reset ? [] : [...setup.availableFilters];

        const filterWheelId = setup.filterWheelDevice;
        if (filterWheelId !== null) {
            const fwStateByDevices = this.appStateManager.getTarget().filterWheel.dynStateByDevices;
            if (Obj.hasKey(fwStateByDevices, filterWheelId)) {
                const fwState = fwStateByDevices[filterWheelId];
                if (fwState.filterIds.length) {
                    newFilters = [...fwState.filterIds];
                }
            }
        }

        // Dedup newFilters
        const result = [];
        const resultDedup = new Set();
        for(const id of newFilters) {
            if (!resultDedup.has(id)) {
                resultDedup.add(id);
                result.push(id);
            }
        }

        setup.availableFilters = result;
    }

    getByUuid = (uuid:string): ImagingSetup => {
        const byuuid = this.currentStatus.configuration.byuuid;
        if (!Obj.hasKey(byuuid, uuid)) {
            throw new Error("Invalid imaging setup uuid");
        }
        return byuuid[uuid];
    }

    setDevice = async (ct:CancellationToken, payload: {imagingSetupUuid: string, device: "cameraDevice"|"focuserDevice"|"filterWheelDevice", value: string|null})=> {
        const imagingSetup = this.getByUuid(payload.imagingSetupUuid);
        if (imagingSetup[payload.device] === payload.value) {
            return;
        }

        imagingSetup[payload.device] = payload.value;
        if (payload.device === "focuserDevice") {
            this.updateFilters(payload.imagingSetupUuid, true);
        }
    }

    setName = async (ct:CancellationToken, payload: {imagingSetupUuid: string, name: string})=> {
        const imagingSetup = this.getByUuid(payload.imagingSetupUuid);
        if (imagingSetup.name === payload.name) {
            return;
        }

        if (this.getUsedNames().has(payload.name)) {
            throw new Error("Name already in use");
        }

        imagingSetup.name = payload.name;
    }

    updateCurrentSettings= async (ct: CancellationToken, payload: {imagingSetupUuid: string, diff: any}) => {
        const imagingSetup = this.getByUuid(payload.imagingSetupUuid);

        const newImagingSetup = JsonProxy.applyDiff(imagingSetup, payload.diff);
        // FIXME: do the checking !
        this.currentStatus.configuration.byuuid[payload.imagingSetupUuid] = newImagingSetup;
    }

    getImageSetups() {
        const ret = [];
        const byuuid = this.currentStatus.configuration.byuuid;
        for(const uuid of Object.keys(byuuid)) {
            ret.push(byuuid[uuid]);
        }
        return ret;
    }

    getUsedNames() {
        let knownNames: Set<string> = new Set();
        for(const imageSetup of this.getImageSetups()) {
            knownNames.add(imageSetup.name);
        }
        return knownNames;
    }

    dedupName(name: string): string {
        const knownNames = this.getUsedNames();
        let id = 0;
        let suffix='';
        while (knownNames.has(name+suffix)) {
            id++;
            suffix = `(${id})`
        }
        return name + suffix;
    }

    defaultDynState=()=>{
        return {
            curFocus: null,
            refFocus: null,
            temperatureWarning: null,
            focuserWarning: null,
            filterWheelWarning: null,
        }
    }

    defaultFocuserSettings():FocuserSettings {
        return {
            range: 1000,
            steps: 5,
            backlash: 200,
            lowestFirst: false,
            targetCurrentPos: true,
            targetPos: 10000,
            focuserFilterAdjustment: {},
            temperatureProperty: null,
            focusStepPerDegree: null,
            focusStepTolerance: 0,
            interruptGuiding: false,
        }
    }

    updateFocuserSettings(t: Partial<FocuserSettings>):FocuserSettings {
        return Object.assign(this.defaultFocuserSettings(), t);
    }

    defaultCameraSettings() {
        return {
            exposure: 1.0
        }
    }

    buildDefaultImageSetup(cameraDevice: string):ImagingSetup {
        return {
            name: this.dedupName(cameraDevice),
            cameraDevice: cameraDevice,
            availableFilters: [],
            filterWheelDevice: null,
            focuserDevice: null,
            focuserSettings: this.defaultFocuserSettings(),
            cameraSettings: this.defaultCameraSettings(),
            dynState: this.defaultDynState(),
            refFocus: null,
        }
    }

    initDefaultImageSetups=()=> {
        let knownCameras:{[id:string]:boolean} = {};
        for(const imageSetup of this.getImageSetups()) {
            if (imageSetup.cameraDevice !== null) {
                knownCameras[imageSetup.cameraDevice] = true;
            }
        }

        const devices = this.indiManager.currentStatus.availableCameras;
        for(const camera of devices) {
            if (!Obj.hasKey(knownCameras, camera)) {
                const imageSetup = this.buildDefaultImageSetup(camera);
                this.currentStatus.configuration.byuuid[this.idGenerator.next()] = imageSetup;
            }
        }
    }

    getAPI=()=>{
        return {
            setDevice: this.setDevice,
            setName: this.setName,
            updateCurrentSettings: this.updateCurrentSettings,
        }
    }

    getImagingSetupInstance(imagingSetupId: string|null) {
        return new ImagingSetupInstance(this, imagingSetupId);
    }

}
