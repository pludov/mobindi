import { canonicalize } from 'json-canonicalize';
import { UncheckedPipe } from './SystemPromise';
import CancellationToken from 'cancellationtoken';
import Log from './Log';
import { Watch } from './shared/Watch';
import Sleep from './Sleep';
import { createTask } from './Task';
import { RequestControl, RequestGenerator } from './RequestHandler';

const logger = Log.logger(__filename);

export type DeviceDesc = {[key: string]: string};

/* This implement match detection for a device */
class CriteriaWatch {
    readonly globalMonitor: SystemDeviceManager;
    readonly criterias: {[id:string]: string} = {};
    readonly watches: Array<DeviceWatch> = [];

    state: boolean|undefined;

    constructor(globalMonitor: SystemDeviceManager, criterias: {[id: string]:string}) {
        this.globalMonitor = globalMonitor;
        this.criterias = criterias;
    }

    removeWatch(c: DeviceWatch) {
        const idx = this.watches.indexOf(c);
        if (idx >= 0) {
            for(const old of this.watches.splice(idx, 1)) {
                old.unregister();
            }
            if (this.watches.length === 0) {
                this.globalMonitor.removeWatch(this);
            }
        }
    }

    addWatch(cb: (present: boolean) =>  void) : DeviceWatch {
        const watch = new DeviceWatch(cb, this);
        this.watches.push(watch);
        Promise.resolve().then(watch.invoke);
        return watch;
    }

    broadcast(newValue: boolean) {
        logger.debug("Updating to new state", {newValue, oldValue: this.state, criterias: this.criterias});
        if (newValue === this.state) {
            return;
        }

        this.state = newValue;

        for(const w of [...this.watches]) {
            Promise.resolve().then(w.invoke);
        }
    }

    update(devices: Array<DeviceDesc>) {
        let contains = false;
        logger.debug("Checking devices", {criterias: this.criterias});
        for(const d of devices) {
            let match = true;
            for(const [k, v] of Object.entries(this.criterias)) {
                if ((!Object.prototype.hasOwnProperty.call(d, k)) || d[k] !== v) {
                    match = false;
                    break;
                }
            }
            if (match) {
                contains = true;
                break;
            }
        }
        this.broadcast(contains);
    }
}


class DeviceWatch {
    private cb: ((present:boolean)=>void)|undefined;
    private sent: undefined|boolean;
    private readonly device: CriteriaWatch;
    constructor(cb: (present:boolean)=>void, device: CriteriaWatch) {
        this.cb = cb;
        this.device = device;
        this.sent = undefined;
    }

    public unregister=()=>{
        this.cb = undefined;
        this.device.removeWatch(this);
    }

    invoke = ()=>{
        if (this.cb) {
            const value = this.device.state;
            if (value === undefined) {
                return;
            }
            if (value === this.sent) {
                return;
            }
            this.sent = value;
            this.cb(value);
        }
    }
}


export default class SystemDeviceManager {
    private readonly watches = new Map<string, CriteriaWatch>();
    private readonly monitoringRequired = new Watch<boolean>(false);
    private lastState : Array<DeviceDesc>|undefined;
    // Return an unregister function
    watch(criterias: {[id: string]:string}, cb:(present:boolean)=> void) : ()=>void {
        const devid = canonicalize(criterias);
        let init = false;
        if (!this.watches.has(devid)) {
            this.watches.set(devid, new CriteriaWatch(this, JSON.parse(devid)));
            init = true;
        }
        const watch = this.watches.get(devid)!;
        const ret = watch.addWatch(cb);
        this.monitoringRequired.update((cur)=>true);
        this.lastState = undefined;
        return ret.unregister;
    }

    removeWatch(watch: CriteriaWatch) {
        const devid = canonicalize(watch.criterias);
        this.watches.delete(devid);

        this.monitoringRequired.update((cur)=>this.watches.size != 0);
    }

    run=async ()=> {
        while(true) {
            // wait that monitoring is required
            await this.monitoringRequired.waitFor(CancellationToken.CONTINUE, (e)=>!!e)

            logger.info("Starting device monitoring");
            let { token, cancel } = CancellationToken.create();

            let ret = await Promise.allSettled(
                [
                    this.monitoringRequired.waitFor(token,  (e)=>!e).finally(()=>cancel("monitoring no more required")),
                    this.monitor(token).finally(()=>cancel("monitoring task finished")),
                ]
            );
            ret.forEach((r)=> {
                if (r.status === "rejected" && !(r.reason instanceof CancellationToken.CancellationError)) {
                    logger.error("Device monitoring failed", {error: r.reason});
                }
            });

            logger.info("Device monitoring ended");
        }
    }

    monitor=async (ct: CancellationToken) => {
        // Watch for input... wait a bit and trigger a refresh for every watched devices
        const nextMonitoring = new Watch<number|undefined>(0);

        // One process will pipe stdout from udevadm monitor, and set the nextMonitoring if not already set
        // One process will wait for nextMonitoring to not be undefined, then clear it, wait until its happen, and refresh
        await createTask(
            ct,

            async (task)=> {

                let ret = await Promise.allSettled(
                    [
                        this.refresh(task.cancellation, nextMonitoring).finally(()=>task.cancel("next monitoring interrupted")),
                        this.poll(task.cancellation, nextMonitoring).finally(()=>task.cancel("poll interrupted")),
                    ]
                );
                ret.forEach((r)=> {
                    if (r.status === "rejected") {
                        const reason = r.reason;
                        if (!(reason instanceof CancellationToken.CancellationError)) {
                            throw r.reason;
                        }
                    }
                });
                ct.throwIfCancelled();
            }
        );
    }

    broadcast(devices: Array<DeviceDesc>) {
        // Broadcast the devices to all watches
        const done = new Set<string>();
        while(true) {
            let sthDone = false;
            for(const watchKey of Array.from(this.watches.keys())) {
                if (done.has(watchKey)) {
                    continue;
                }
                sthDone = true;
                done.add(watchKey);
                const watch = this.watches.get(watchKey);
                if (watch === undefined) {
                    continue;
                }
                watch.update(devices);
            }
            if (!sthDone) {
                return;
            }
        }
    }

    refresh = async(ct: CancellationToken, nextMonitor: Watch<number|undefined>) => {

        while(true) {
            let nextSleep : number = (await nextMonitor.waitFor(ct, (e)=>e !== undefined))!;
            let now = new Date().getTime();
            if (nextSleep > now) {
                await Sleep(ct, nextSleep - now);
            }
            nextMonitor.update((e)=>undefined);
            logger.info("Refreshing devices");
            let devices = await getDevices(ct);
            this.broadcast(devices);
        }

    }
    poll = async(ct: CancellationToken, nextMonitor: Watch<number|undefined>) => {
        await watchChanges(ct, ()=> {
            nextMonitor.update((s) => {
                if (s !== undefined) {
                    return s;
                }
                logger.debug("Scheduling device refresh");
                return new Date().getTime() + 200;
            });
        });
    }

    watchDevice = async(ct: CancellationToken, payload: { criteria: {[id: string]: string} }, ctrl: RequestControl & RequestGenerator<Array<{[id: string]: string}>>) => {
        while(true) {
            await Sleep(ct, 1000);
            await ctrl.stream([{}]);
        }
    }

    getAPI = () => {
        return {
            watchDevice: this.watchDevice
        }
    }
}

function getDevTitle(d:{[k: string]:string}):string {
    const keys = [
        ['ID_VENDOR_FROM_DATABASE','ID_VENDOR'],
        ['ID_MODEL_FROM_DATABASE', 'ID_MODEL'],
        ['ID_SERIAL_SHORT', 'ID_SERIAL'],
    ]

    let v = keys.map(items => {
        for(const item of items) {
            if (d[item]) return d[item];
        }
        return undefined;
    }).filter(e=>!!e);

    if (v.length < 2) {
        v.splice(0,0,`${d.SUBSYSTEM}:${d.SYSNAME}`);
    }
    return v.join(' - ');

}

async function watchChanges(ct: CancellationToken, onChange: () => void): Promise<void> {
    await UncheckedPipe(ct, {
            command: ['udevadm', 'monitor', '-u'],
        },
        undefined,
        (e:string)=>{
            logger.debug("udevadm activity", {event: e});
            onChange();
        }
    );
}

async function getDevices(ct: CancellationToken): Promise<Array<DeviceDesc>> {
    const ret: Array<DeviceDesc> = [];
    const subsystemBlackList = new Map<string, boolean>(
        [
            'acpi', 'wakeup', 'sound', 'video4linux',
            'input', 'net', 'tty', 'hidraw', 'hid', 'vc',
            'workqueue', 'msr','graphics','devlink','bdi',
            'memory','clockevents', 'pci_bus', 'drm',
            'scsi_host', 'ata_port', 'ata_link', 'ata_device',
            'wmi',
        ].map((t)=>[t, true])
    );
    const devTypeBlackList = new Map<string, boolean>(
        [
            'partition',     // all partitions have a disc
            'usb_interface', // they have a usb_device

        ].map((t)=>[t, true])
    );

    await UncheckedPipe(ct, {
            command: ['udevadm', 'info', '-e', '--json=short', 'tty'],
        },
        undefined,
        (e:string)=>{
            const devDesc = JSON.parse(e);
            const subsystem = devDesc.SUBSYSTEM;
            delete(devDesc.TAGS);
            delete(devDesc.CURRENT_TAGS);
            delete(devDesc.MODALIAS);
            delete(devDesc.DEVLINKS);
            delete(devDesc.DEVPATH);
            delete(devDesc.USEC_INITIALIZED);

            if (!subsystem) {
                return;
            }
            if (subsystemBlackList.get(subsystem)) {
                return;
            }
            const devType = devDesc.DEVTYPE;

            if (devType && devTypeBlackList.get(devType)) {
                return;
            }

            const textTitle = getDevTitle(devDesc);

            const desc_with_title = {title: textTitle, ...devDesc};

            ret.push(desc_with_title);
        }
    );
    return ret;
}


async function demo() {

    const devices = await getDevices(CancellationToken.CONTINUE);
    console.log("Devices:", devices);

    const monitor = new SystemDeviceManager();
    monitor.run();

    await Sleep(CancellationToken.CONTINUE, 1000);

    const watch = {
        ID_VENDOR: 'pludov',
        ID_SERIAL_SHORT: 'E66038B713397937',
    };
    const w = monitor.watch(watch, (present)=> {
        console.log('Presence of device', watch, 'is now', present);
    });
}

// demo();