import CancellationToken from 'cancellationtoken';
import Log from './Log';
import { ExpressApplication, AppContext } from "./ModuleBase";
import { BackofficeStatus, FilterWheelStatus} from './shared/BackOfficeStatus';
import JsonProxy, { TriggeredWildcard, NoWildcard } from './JsonProxy';
import { hasKey, deepCopy } from './Obj';
import { DriverInterface, Vector } from './Indi';
import {Task, createTask} from "./Task.js";
import * as Obj from "./Obj";
import * as RequestHandler from "./RequestHandler";
import * as BackOfficeAPI from "./shared/BackOfficeAPI";

const logger = Log.logger(__filename);

export default class FilterWheel
        implements RequestHandler.APIAppProvider<BackOfficeAPI.FilterWheelAPI>
{
    appStateManager: JsonProxy<BackofficeStatus>;
    switchPromises: {[filterWheelId: string]:Task<void>};
    currentStatus: FilterWheelStatus;
    context: AppContext;
    get indiManager() { return this.context.indiManager };
    get focuser() { return this.context.focuser };
    constructor(app:ExpressApplication, appStateManager:JsonProxy<BackofficeStatus>, context:AppContext) {
        this.appStateManager = appStateManager;
        this.appStateManager.getTarget().filterWheel = {
            availableDevices: [],
            dynStateByDevices: {},
        };

        // Device => promise
        this.switchPromises = {};
        this.currentStatus = this.appStateManager.getTarget().filterWheel;
        this.context = context;

        // Update available filterwheels
        context.indiManager.createDeviceListSynchronizer((devs:string[])=> {
            this.currentStatus.availableDevices = devs;
        }, undefined, DriverInterface.FILTER);

        // Update dynState for each filterwheels
        this.appStateManager.addSynchronizer(
            [ 'filterWheel', 'availableDevices' ],
            ()=> {
                const dynStateRoot = this.currentStatus.dynStateByDevices;
                for(const o of this.currentStatus.availableDevices) {
                    if (!Obj.hasKey(dynStateRoot, o)) {
                        dynStateRoot[o] = {
                            targetFilterPos: null,
                            currentFilterPos: null,
                            filterIds: [],
                        }
                    }
                }
            },
            true);
        
        // Compute available filter list
        this.appStateManager.addSynchronizer(
            [
                [
                    [ 'filterWheel', 'availableDevices' ],
                    [ 'filterWheel', 'dynStateByDevices', null ],
                    [ 'indiManager', 'deviceTree', null, 'FILTER_NAME' ],
                    [ 'indiManager', 'deviceTree', null, 'FILTER_SLOT', 'childs', 'FILTER_SLOT_VALUE', [['$min'],['$max']] ],
                ]
            ],
            this.updateFilterIdsForSomeFilterWheels,
            true,
            true
        )

        // Compute current filter
        this.appStateManager.addSynchronizer(
            [
                [
                    [ 'indiManager', 'deviceTree', null, 'FILTER_SLOT', 'childs', 'FILTER_SLOT_VALUE', '$_' ],
                    [ 'filterWheel', 'dynStateByDevices', null ],
                ]
            ],
            this.updateCurrentFilterPosForSomeFilterWheels,
            true,
            true,
        );
        this.indiManager.createMultiPreferredDeviceSelector({
            availablePreferedCurrentPath:
                [
                    [
                        ['filterWheel', 'availableDevices'],
                        ['camera', 'configuration', 'deviceSettings', null, 'preferedFilterWheelDevice'],
                        ['camera', 'dynStateByDevices', null, 'filterWheelDevice']
                    ]
                ]
            ,
            list:()=>Object.keys(this.context.camera.currentStatus.dynStateByDevices),
            read:(camId:string)=>{
                const camStatus = this.context.camera.currentStatus;
                if (!hasKey(camStatus.dynStateByDevices, camId)) {
                    return null;
                }
                if (!hasKey(camStatus.configuration.deviceSettings, camId)) {
                    return null;
                }
                return {
                    available: this.currentStatus.availableDevices,
                    current: camStatus.dynStateByDevices[camId].filterWheelDevice || null,
                    prefered: camStatus.configuration.deviceSettings[camId].preferedFilterWheelDevice || null,
                }
            },
            set:(camId: string, values) => {
                const camStatus = this.context.camera.currentStatus;
                if (values.current !== undefined) {
                    camStatus.dynStateByDevices[camId].filterWheelDevice = values.current;
                }
                if (values.prefered !== undefined) {
                    camStatus.configuration.deviceSettings[camId].preferedFilterWheelDevice = values.prefered;
                }
            }
        });
    }

    private updateCurrentFilterPos=(deviceId:string)=> {
        if (!hasKey(this.currentStatus.dynStateByDevices, deviceId)) {
            return null;
        }
        let pos:number|null = null;
        try {
            const device = this.indiManager.getValidConnection().getDevice(deviceId);

            const slotVec = device.getVector('FILTER_SLOT').getVectorInTree();
            if (slotVec !== null) {
                pos = parseInt(slotVec.childs.FILTER_SLOT_VALUE.$_, 10);
                if (isNaN(pos)) {
                    pos = null;
                }
            }
        } catch(e) {
        }
        this.currentStatus.dynStateByDevices[deviceId].currentFilterPos = pos;
    }

    private updateCurrentFilterPosForSomeFilterWheels=(wildcards:TriggeredWildcard)=> {
        const idList = wildcards[NoWildcard]
            ? Object.keys(this.currentStatus.dynStateByDevices)
            : Object.keys(wildcards);

        for(const id of idList) {
            this.updateCurrentFilterPos(id);
        }
    }

    // Un filter id est soit un chiffre (parseInt) soit #filterId
    private computeFilterIds= (deviceId:string)=> {
        const ret: string[] = [];
        const device = this.indiManager.getValidConnection().getDevice(deviceId);

        const nameVec = device.getVector('FILTER_NAME').getVectorInTree();
        if (nameVec != null) {
            const occ : {[id:string]:number} = {};
            for(const id of nameVec.childNames) {
                const value = nameVec.childs[id].$_;
                const filterId = "#" + value.replace(/#/g, '_');
                
                if (!hasKey(occ,filterId)) {
                    occ[filterId] = 1;
                    ret.push(filterId);
                } else {
                    occ[filterId]++;
                    ret.push(filterId + ' #' + occ[filterId]);
                }
            }
        } else {
            // Just trust the slots
            const slotVec = device.getVector('FILTER_SLOT').getVectorInTree();
            
            if (slotVec !== null && slotVec.childs['FILTER_SLOT_VALUE']) {
                const value = slotVec.childs['FILTER_SLOT_VALUE']
                const min = parseInt(value.$min!);
                const max = parseInt(value.$max!);
                if (!isNaN(min) && !isNaN(max)) {
                    for(let i = min; i < max; ++i) {
                        ret.push("" + i);
                    }
                }
            }
        }
        return ret;
    }

    private updateFilterIds=(fwId: string)=> {
        if (!hasKey(this.currentStatus.dynStateByDevices, fwId)) {
            return null;
        }
        let ret:string[] = [];
        try {
            ret = this.computeFilterIds(fwId);
        } catch(e) {
        }
        this.currentStatus.dynStateByDevices[fwId].filterIds = ret;
    }

    updateFilterIdsForSomeFilterWheels=(wildcards:TriggeredWildcard)=> {
        const idList = wildcards[NoWildcard]
            ? Object.keys(this.currentStatus.dynStateByDevices)
            : Object.keys(wildcards);
            
        for(const id of idList) {
            this.updateFilterIds(id);
        }

    }

    setFilterWheel=async (ct: CancellationToken, payload:{cameraDeviceId:string, filterWheelDeviceId: string|null})=>{
        const camStatus = this.context.camera.currentStatus;
        if (!hasKey(camStatus.dynStateByDevices, payload.cameraDeviceId)) {
            throw new Error("Invalid camera");
        }
        if ((payload.filterWheelDeviceId !== null) && this.currentStatus.availableDevices.indexOf(payload.filterWheelDeviceId) === -1) {
            throw new Error("Invalid filterwheel");
        }
        camStatus.dynStateByDevices[payload.cameraDeviceId].filterWheelDevice = payload.filterWheelDeviceId;
        camStatus.configuration.deviceSettings[payload.cameraDeviceId].preferedFilterWheelDevice = payload.filterWheelDeviceId;
    }

    abortFilterChange= async(ct:CancellationToken, payload:any)=>{}

    private needConfirmation(fwId:string) {
        if (this.isManualFilterIndiDriver(fwId)) {
            return true;
        }
        const devConf = this.indiManager.currentStatus.configuration.indiServer.devices;
        if (!hasKey(devConf, fwId)) {
            return false;
        }

        return !!devConf[fwId].options.confirmFilterChange;
    }

    private isManualFilterIndiDriver(fwId:string) {
        const driver = this.indiManager.getValidConnection().getDevice(fwId).getVector("DRIVER_INFO").getPropertyValueIfExists("DRIVER_EXEC");
        return driver === "indi_manual_wheel";
    }

    private getFilterSettings(fwId: string) {
        const devConf = this.indiManager.currentStatus.configuration.indiServer.devices;
        if (!hasKey(devConf, fwId)) {
            return undefined;
        }
    
        return devConf[fwId].options.filterSettings;
    }

    updateFilterFocus= async(ct:CancellationToken, payload: {cameraDeviceId: string, filterId: string}) => {
        let filterWheelDeviceId:string;
        
        const camStatus = this.context.camera.currentStatus;
        if (!hasKey(camStatus.dynStateByDevices, payload.cameraDeviceId)) {
            throw new Error("Invalid camera");
        }
        const camDynState = camStatus.dynStateByDevices[payload.cameraDeviceId];
        if (!camDynState.filterWheelDevice) {
            throw new Error("Camera has no filterwheel");
        }
        filterWheelDeviceId = camDynState.filterWheelDevice;
        
        const settings = this.getFilterSettings(filterWheelDeviceId);
        if (!settings) {
            logger.info('FilterWheel has no filter settings', {payload});
            return;
        }

        if (settings.disabled) {
            logger.info('FilterWheel focus adjustment is disabled', {payload, settings});
            return;
        }

        if (!Obj.hasKey(settings.delta || {}, payload.filterId)) {
            logger.warn('FilterWheel has no shift information for filter id', {payload, settings});
            return;
        }
        
        if (!Obj.hasKey(settings.delta || {}, settings.ref)) {
            logger.warn('FilterWheel has no shift information for reference filter', {payload, settings});
            return;
        }

        // Here, assume focuser & filterwheel are the same device.
        const focuserDeviceId = settings.focuser || filterWheelDeviceId;

        let deltaTemp:number = 0;
        let currentTemp:number|null = null;

        if (settings.tempSensor !== undefined) {

            // (parseFloat(currentTemp) - settings?.refTemp)

            let sensorPath = settings.tempSensor.split(/\./);
            if (sensorPath.length < 3) {
                sensorPath = [focuserDeviceId, ...sensorPath];
            }

            const [meteoDeviceId, meteoVec, meteoProp] = sensorPath;

            const meteoDevice = this.indiManager.checkDeviceConnected(meteoDeviceId);
        
            let currentTempStr = meteoDevice.getVector(meteoVec).getPropertyValueIfExists(meteoProp);

            if (currentTempStr === null || isNaN(parseFloat(currentTempStr))) {
                logger.warn('Unable to adjust focus : invalid temperature', {sensorPath, payload, currentTemp});
                throw new Error("Unable to read focuser temperature");
            }

            if (settings.refTemp === undefined) {
                throw new Error("Missing reference temperature");
            }

            currentTemp = parseFloat(currentTempStr);
            deltaTemp = currentTemp - settings.refTemp;
        }
        
        const currentPos = this.focuser.getFocuserPos(focuserDeviceId);
        
        let newPos = settings?.refPos +
                    (settings.delta[payload.filterId] - settings.delta[settings.ref]) +
                    deltaTemp * (settings?.compensation || 0);
        
        logger.info("Focuser adjustment computed", {focuserDeviceId, filterWheelDeviceId, currentPos, newPos, currentTemp, deltaTemp, settings});
        if (Math.round(newPos) === Math.round(currentPos)) {
            logger.info("Skipping focuser adjustment for same step value");
            return;
        }
        let delta = Math.abs(newPos - currentPos);
        if (settings.min !== undefined && delta < settings.min) {
            logger.info("Skipping focuser adjustment under the move thresold", {newPos, currentPos, delta, settings});
        }
        if (settings.max !== undefined && delta > settings.max) {
            logger.warn("Rejecting focuser adjustment over the move thresold", {newPos, currentPos, delta, settings});
            throw new Error("Focuser move is too large");
        }

        await this.focuser.moveFocuserWithBacklash(ct, focuserDeviceId, newPos);
    }

    // Operation can be canceled by user
    changeFilter= async(ct:CancellationToken, payload: {cameraDeviceId?: string, filterWheelDeviceId?: string, filterNumber?: number, filterId?: string, force?: boolean})=>{
        let filterWheelDeviceId:string;
        if (payload.filterWheelDeviceId === undefined) {
            if (payload.cameraDeviceId === undefined) {
                throw new Error("Camera or filterWheel required");
            }
            const camStatus = this.context.camera.currentStatus;
            if (!hasKey(camStatus.dynStateByDevices, payload.cameraDeviceId)) {
                throw new Error("Invalid camera");
            }
            const camDynState = camStatus.dynStateByDevices[payload.cameraDeviceId];
            if (!camDynState.filterWheelDevice) {
                throw new Error("Camera has no filterwheel");
            }
            filterWheelDeviceId = camDynState.filterWheelDevice;
        } else {
            filterWheelDeviceId = payload.filterWheelDeviceId;
        }

        const checkFilterWheel=(force?: boolean)=>{
            if (!hasKey(this.currentStatus.dynStateByDevices, filterWheelDeviceId)) {
                throw new Error("Device not available");
            }
            let filterPos:number;
            if (payload.filterId !== undefined) {
                let i = this.currentStatus.dynStateByDevices[filterWheelDeviceId].filterIds.indexOf(payload.filterId);
                if (i === -1) {
                    throw new Error("Unknown filter");
                }
                filterPos = i + 1;
            } else if (payload.filterNumber !== undefined) {
                // FIXME: check bounds but indi SHOULD explicitely reject invalid values
                filterPos = payload.filterNumber!;
            } else {
                throw new Error("No filter provided");
            }

            if (this.currentStatus.dynStateByDevices[filterWheelDeviceId].targetFilterPos !== null) {
                throw new Error("Filter wheel busy");
            }
            if ((!(payload.force || force))
                && this.currentStatus.dynStateByDevices[filterWheelDeviceId].currentFilterPos === filterPos)
            {
                logger.debug('FilterWheel already at pos', {filterWheelDeviceId, filterPos});
                return undefined;
            }
            return filterPos;
        }

        logger.info('FilterWheel move', {filterWheelDeviceId, payload});
        let filterPos:number|undefined;
        if ((filterPos = checkFilterWheel()) === undefined) {
            return false;
        }
        let confirmed: boolean;
        if (this.needConfirmation(filterWheelDeviceId)) {
            logger.info('Asking confirmation for filter change', {filterWheelDeviceId});
            const manualDriver = this.isManualFilterIndiDriver(filterWheelDeviceId);

            const filterTitle = this.currentStatus.dynStateByDevices[filterWheelDeviceId].filterIds[filterPos];
            const ready = await this.context.notification.dialog(ct,
                    (manualDriver
                        ? "Move filter of "
                        : "Confirm filter change of ")
                         + filterWheelDeviceId + " to: " + filterTitle,
                    [
                        {
                            title: "ok",
                            value: true,
                        },
                        {
                            title: "pause",
                            value: false,
                        }
                    ]);
            if (!ready) {
                logger.info('User canceled filter change', {filterWheelDeviceId});
                throw new CancellationToken.CancellationError("User canceled");
            }

            // For manual filter wheel, issue a sync
            if (manualDriver) {
                logger.debug('Syncing manual filter wheel', {filterWheelDeviceId});
                await this.indiManager.setParam(ct,
                    filterWheelDeviceId,
                    "SYNC_FILTER",
                    {"TARGET_FILTER": "" + filterPos},
                    true,
                    false
                    // FIXME: cancelator
                );
                return true;
            }

            if ((filterPos = checkFilterWheel(true)) === undefined) {
                return false;
            }
        }

        try {
            // record target pos in dynState
            this.currentStatus.dynStateByDevices[filterWheelDeviceId].targetFilterPos = filterPos;
            logger.info('Moving FilterWheel', {filterWheelDeviceId, filterPos});
            await this.indiManager.setParam(ct,
                filterWheelDeviceId,
                'FILTER_SLOT',
                {'FILTER_SLOT_VALUE': "" + filterPos},
                true,
                false
                // FIXME: cancelator
            );
            logger.info('Done moving filterWheel', {filterWheelDeviceId, filterPos});
        } finally {
            this.currentStatus.dynStateByDevices[filterWheelDeviceId].targetFilterPos = null;
        }

        // Adjust the focuser (special case, hardcoded here)
        this.currentStatus

        return true;
    }

    getAPI() {
        return {
            setFilterWheel:this.setFilterWheel,
            abortFilterChange: this.abortFilterChange,
            changeFilter: this.changeFilter,
        }
    }
}
