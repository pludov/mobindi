import CancellationToken from 'cancellationtoken';
import Log from './Log';
import { ExpressApplication, AppContext } from "./ModuleBase";
import { BackofficeStatus, FilterWheelStatus} from './shared/BackOfficeStatus';
import JsonProxy, { TriggeredWildcard, NoWildcard } from './shared/JsonProxy';
import { hasKey } from './shared/Obj';
import { Task } from "./Task.js";
import * as Obj from "./shared/Obj";
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

    constructor(app:ExpressApplication, appStateManager:JsonProxy<BackofficeStatus>, context:AppContext) {
        this.appStateManager = appStateManager;
        this.appStateManager.getTarget().filterWheel = {
            dynStateByDevices: {},
        };

        // Device => promise
        this.switchPromises = {};
        this.currentStatus = this.appStateManager.getTarget().filterWheel;
        this.context = context;

        // Update dynState for each filterwheels
        this.appStateManager.addSynchronizer(
            [ 'indiManager', 'availableFilterWheels' ],
            ()=> {
                const dynStateRoot = this.currentStatus.dynStateByDevices;
                for(const o of this.indiManager.currentStatus.availableFilterWheels) {
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
                    [ 'indiManager', 'availableFilterWheels' ],
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

    public getFilterId(fwId: string, no: number) {
        try {
            const ids = this.computeFilterIds(fwId);
            if (no >= 1 && no <= ids.length) {
                return ids[no-1];
            }
            return "" + no;
        } catch(e) {
            return "" + no;
        }
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

    // Operation can be canceled by user
    changeFilter= async(ct:CancellationToken, payload: {filterWheelDeviceId: string, filterNumber?: number, filterId?: string, force?: boolean})=>{
        const filterWheelDeviceId = payload.filterWheelDeviceId;
        
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

            const filterTitle = this.currentStatus.dynStateByDevices[filterWheelDeviceId].filterIds[filterPos - 1];
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
        return true;
    }

    getAPI() {
        return {
            abortFilterChange: this.abortFilterChange,
            changeFilter: this.changeFilter,
        }
    }
}
