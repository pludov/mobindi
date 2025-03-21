/**
 * Created by ludovic on 21/07/17.
 */
import Log from './Log';
import { ExpressApplication, AppContext } from "./ModuleBase";
import { IndiManagerStatus, BackofficeStatus, IndiProfileConfiguration, ProfilePropertyAssociation } from './shared/BackOfficeStatus';
import JsonProxy, { NoWildcard, TriggeredWildcard } from './shared/JsonProxy';
import CancellationToken from 'cancellationtoken';
import * as RequestHandler from "./RequestHandler";
import * as BackOfficeAPI from "./shared/BackOfficeAPI";
import { IdGenerator } from './IdGenerator';

import { add3D, delete3D, getOwnProp, getOrCreateOwnProp, get3D, set3D, count3D } from './shared/Obj';
import Timeout from './Timeout';

const logger = Log.logger(__filename);

type PropertyRuntimeInfo = {
    dev: string;
    vec: string;
    prop: string|null;
    profiles: string[];
    // The value from the last controlling profile
    wanted: string;
}

type ApplyResult = {
    success: boolean;
}

type ApplyNeeded = {
    dev: string;
    vec: string;
    prop: string|null;
    wanted: string;
}

export default class IndiProfileManager implements RequestHandler.APIAppProvider<BackOfficeAPI.IndiProfileAPI>{
    app: ExpressApplication;
    appStateManager: JsonProxy<BackofficeStatus>;
    context: AppContext;
    indiManager: IndiManagerStatus;
    profileIdGenerator = new IdGenerator();

    // Dynamic status for all watched properties
    // This is kept out of the main status to avoid flooding the client with intermediate data
    watchedProps: ProfilePropertyAssociation<PropertyRuntimeInfo> = {};

    // Properties that needs checking
    dirtyProps: ProfilePropertyAssociation<boolean> = {};
    dirtyTimer: NodeJS.Timeout|undefined;

    notificationId: string|undefined;

    constructor(app: ExpressApplication, appStateManager:JsonProxy<BackofficeStatus>, context: AppContext) {
        this.app = app;
        this.appStateManager = appStateManager;
        this.context = context;

        this.indiManager = appStateManager.getTarget().indiManager;

        this.appStateManager.addSynchronizer(['indiManager', 'configuration', 'profiles', 'list'], this.updateIdGenerator, true);

        // This synchronizer listen for all value change
        this.appStateManager.addSynchronizer(
            ['indiManager', 'configuration', 'profiles'],
            this.fullRefreshProfileStatus, true);


        this.appStateManager.addSynchronizer(
            [   'indiManager',
                'deviceTree',
                null,
                null,
                'childs',
                null,
                '$_'
            ],
            this.verifyPropertyWildcard, false, true);
    }

    private readonly fullRefreshProfileStatus = () => {
        // List all active profiles

        this.watchedProps = {};
        this.dirtyProps = {};

        const activeProfiles = this.indiManager.configuration.profiles.list.filter((uid)=>this.indiManager.configuration.profiles.byUid[uid]?.active);
        for(const profileId of activeProfiles) {
            const profile = this.indiManager.configuration.profiles.byUid[profileId];
            if (!profile.active) {
                continue;
            }
            for(const dev of Object.keys(profile.keys)) {
                const devKeys = profile.keys[dev];
                const watchedDev = getOrCreateOwnProp(this.watchedProps, dev);
                const dirtyDev = getOrCreateOwnProp(this.dirtyProps, dev);

                for(const vec of Object.keys(devKeys)) {
                    const vecKeys = devKeys[vec];
                    const watchedVec = getOrCreateOwnProp(watchedDev, vec);
                    const dirtyVec = getOrCreateOwnProp(dirtyDev, vec);

                    for(const prop of Object.keys(vecKeys)) {
                        const watchedProp = getOrCreateOwnProp(watchedVec, prop, () => ({
                            dev,
                            vec,
                            prop: prop === "." ? null : prop,
                            value: null,
                            wanted: "",
                            profiles: []
                        }));
                        watchedProp.profiles.push(profileId);
                        watchedProp.wanted = vecKeys[prop].value;
                        dirtyVec[prop] = true;
                    }
                }
            }
        }
        this.checkDirtyProperties(true);
    }

    private readonly checkDirtyProperties = (forceCounterRefresh: boolean) => {
        if (this.dirtyTimer !== undefined) {
            clearTimeout(this.dirtyTimer);
            this.dirtyTimer = undefined;
        }

        let sthDone = !!forceCounterRefresh;

        logger.debug("Checking dirty properties");
        const indiConnection = this.context.indiManager.connection;
        // What to do if indi connection went down ?
        for(const dev of Object.keys(this.dirtyProps).sort()) {
            const dirtyDev = this.dirtyProps[dev];
            const watchedDev = getOwnProp(this.watchedProps, dev);
            if (!watchedDev) {
                // Ignore if not watched
                if (delete3D(this.dirtyProps, dev)) {
                    sthDone = true;
                }
                continue;
            }
            logger.debug("Checking dirty properties for device", dev);
            const indiDevice = indiConnection?.getDevice(dev);

            for(const vec of Object.keys(dirtyDev).sort()) {
                const dirtyVec = dirtyDev[vec];
                const watchedVec = getOwnProp(watchedDev, vec);
                if (!watchedVec) {
                    // Ignore if not watched
                    if (delete3D(this.dirtyProps, dev, vec)) {
                        sthDone = true;
                    }
                    continue;
                }
                logger.debug("Checking dirty properties for vector", vec);
                const indiVec = indiDevice?.getVector(vec);

                for(const prop of Object.keys(dirtyVec).sort()) {
                    const watchedProp = getOwnProp(watchedVec, prop);
                    if (!watchedProp) {
                        // Ignore if not watched
                        if (delete3D(this.dirtyProps, dev, vec, prop)) {
                            sthDone = true;
                        }

                        logger.info("Property not watched", {dev, vec, prop});
                        continue;
                    }

                    logger.debug("Checking dirty properties for property", prop);

                    let newValue;
                    if (indiVec === undefined) {
                        // Unknown
                        newValue = null;
                    } else {
                        if (prop !== '...whole_vector...') {
                            newValue = indiVec.getPropertyValueIfExists(prop);
                        } else {
                            newValue = indiVec.getFirstActivePropertyIfExists();
                        }
                    }

                    if (newValue !== null && newValue !== watchedProp.wanted) {
                        const existingMismatch = get3D(this.indiManager.profileStatus.mismatches, dev, vec, prop);

                        if ((!existingMismatch)
                            || (existingMismatch.wanted !== watchedProp.wanted)
                            || (existingMismatch.profile !== watchedProp.profiles[watchedProp.profiles.length-1]))
                        {
                            if (!existingMismatch) {
                                logger.debug("Mismatch appear", {dev, vec, prop, newValue, wanted: watchedProp.wanted});
                            }
                            set3D(this.indiManager.profileStatus.mismatches, dev, vec, prop, {
                                wanted: watchedProp.wanted,
                                profile: watchedProp.profiles[watchedProp.profiles.length-1]
                            });
                            sthDone = true;
                        }
                    } else {
                        if (delete3D(this.indiManager.profileStatus.mismatches, dev, vec, prop)) {
                            sthDone = true;
                            logger.debug("Mismatch disappear", {dev, vec, prop, wanted: watchedProp.wanted});
                        }
                    }
                }
            }
        }
        this.dirtyProps = {};

        if (sthDone) {
            let currentCount = this.indiManager.profileStatus.totalMismatchCount;
            let newCount = count3D(this.indiManager.profileStatus.mismatches);
            if (newCount != currentCount) {
                this.indiManager.profileStatus.totalMismatchCount = newCount;

                if (currentCount === 0 && newCount > 0) {
                    this.notificationId = this.context.notification.notify("INDI properties diverge from profile");
                } else if (newCount === 0 && this.notificationId !== undefined) {
                    this.context.notification.unnotify(this.notificationId);
                    this.notificationId = undefined;
                }
            }
        }
    }

    private readonly verifyPropertyWildcard = (id: TriggeredWildcard) => {
        // Apply the wildcard to the hierarchy of watched properties
        const devWildcards = id;
        let sthDone = false;
        for(const dev of (devWildcards[NoWildcard] ? Object.keys(this.watchedProps) : Object.keys(devWildcards))) {
            const watchedDev = getOwnProp(this.watchedProps, dev);
            if (!watchedDev) {
                continue;
            }
            const vecWildcard = devWildcards[NoWildcard] ? undefined : devWildcards[dev];
            // vecWildcard may be undefined (means id stopped at all devices)
            // or contains NoWildcard (means all vectors for this device)
            for(const vec of ((!vecWildcard) || vecWildcard[NoWildcard]) ? Object.keys(watchedDev) : Object.keys(vecWildcard)) {
                const watchedVec = getOwnProp(watchedDev, vec);
                if (!watchedVec) {
                    continue;
                }

                const propWildcard = ((!vecWildcard) || vecWildcard[NoWildcard]) ? undefined : vecWildcard[vec];

                // Consider the whole vector as well
                for(const prop of ((!propWildcard) || propWildcard[NoWildcard]) ? Object.keys(watchedVec) : [...Object.keys(propWildcard), "...whole_vector..."]) {
                    if (!getOwnProp(watchedVec, prop)) {
                        continue;
                    }
                    if (add3D(this.dirtyProps, dev, vec, prop, true)) {
                        sthDone = true;
                    }
                }
            }
        }

        if (sthDone && !this.dirtyTimer) {
            this.dirtyTimer = setTimeout(this.checkDirtyProperties, 100);
        }
    }

    private readonly updateIdGenerator = () => {
        this.profileIdGenerator.used(this.indiManager.configuration.profiles.list);
    }

    readonly createProfile = async (ct: CancellationToken, payload: Partial<Omit<IndiProfileConfiguration, "keys"|"uid">>) => {
        const uid = this.profileIdGenerator.next();
        this.indiManager.configuration.profiles.list.push(uid);
        this.indiManager.configuration.profiles.byUid[uid] = {
            uid,
            name: "New profile",
            active: false,
            ...payload,
            keys: {},
        };
    };

    readonly deleteProfile = async (ct: CancellationToken, payload: { uid: string; }) => {
        const index = this.indiManager.configuration.profiles.list.indexOf(payload.uid);
        if (index >= 0) {
            this.indiManager.configuration.profiles.list.splice(index, 1);
            delete this.indiManager.configuration.profiles.byUid[payload.uid];
        }
    };

    readonly updateProfile = async (ct: CancellationToken, payload: Partial<Omit<IndiProfileConfiguration, "keys">> & {uid:string}) => {
        const profile = this.indiManager.configuration.profiles.byUid[payload.uid];
        if (!profile) {
            throw new Error("Profile not found");
        }
        if (payload.active !== undefined) {
            profile.active = payload.active;
        }
        if (payload.name !== undefined) {
            profile.name = payload.name;
        }
    }

    readonly addToProfile = async (ct: CancellationToken, payload: { uid: string; dev: string; vec: string; prop: string|null }) => {
        const profile = this.indiManager.configuration.profiles.byUid[payload.uid];
        if (!profile) {
            throw new Error("Profile not found");
        }

        // Get the current value
        const vec = this.context.indiManager.getValidConnection().getDevice(payload.dev).getVector(payload.vec);
        let value;
        if (payload.prop) {
            value = vec.getPropertyValue(payload.prop);
        } else {
            value = vec.getFirstActiveProperty();
        }
        if (value === null) {
            throw new Error("Property has no active value");
        }
        set3D(profile.keys, payload.dev, payload.vec, payload.prop === null ? "...whole_vector..." : payload.prop, {
            value
        });
    }

    readonly removeFromProfile = async (ct: CancellationToken, payload: { uid: string; dev: string; vec: string; prop: string|null }) => {
        const profile = this.indiManager.configuration.profiles.byUid[payload.uid];
        if (!profile) {
            throw new Error("Profile not found");
        }

        delete3D(profile.keys, payload.dev, payload.vec, payload.prop === null ? "...whole_vector..." : payload.prop);
    }

    computeProfileTodoList: () => Array<ApplyNeeded> = () => {
        const todo:Array<ApplyNeeded> = [];
        const done:ProfilePropertyAssociation<boolean> = {};

        // Find active profiles
        const activeProfiles = this.indiManager.configuration.profiles.list.filter((uid)=>this.indiManager.configuration.profiles.byUid[uid]?.active);

        for(const profileId of activeProfiles) {
            const profile = this.indiManager.configuration.profiles.byUid[profileId];
            for(const dev of Object.keys(profile.keys)) {
                const devKeys = profile.keys[dev];
                for(const vec of Object.keys(devKeys)) {
                    const vecKeys = devKeys[vec];
                    for(const prop of Object.keys(vecKeys)) {
                        const wanted = vecKeys[prop].value;
                        if (get3D(done, dev, vec, prop)) {
                            continue;
                        }
                        set3D(done, dev, vec, prop, true);
                        todo.push({
                            dev,
                            vec,
                            prop: prop === "...whole_vector..." ? null : prop,
                            wanted
                        });
                    }
                }
            }
        }

        // Lots of vector appears depending on other ones
        // Sort according to dependencies (settings first, then connect, then others)
        // This is totally hacky, but INDI has no estblished way to know which property depends on which
        const propertiesFilters = [
            /CONFIG_PROCESS/,
            /SIMULATOR|DEBUG|POLLING_PERIOD|LOGGING_LEVEL|LOG_OUTPUT/,
            /DEVICE_AUTO_SEARCH/,
            /DEVICE_BAUD_RATE|DEVICE_PORT/,
            /CONNECTION/,
            // Catch all.
            null
        ];

        // Split todo according to the filters
        const filtered:Array<Array<ApplyNeeded>> = propertiesFilters.map((filter)=>[]);
        for(const t of todo) {
            for(let i = 0; i < propertiesFilters.length; ++i) {
                const re = propertiesFilters[i];
                if (re === null || re.test(t.vec)) {
                    filtered[i].push(t);
                    break;
                }
            }
        }
        return filtered.reduce((acc, cur)=>acc.concat(cur), []);
    }

    readonly applyActiveProfiles = async(ct: CancellationToken, payload: {}) => {

        const done:ProfilePropertyAssociation<ApplyResult> = {};

        const todo:Array<ApplyNeeded> = this.computeProfileTodoList();

        logger.info("Applying profiles", todo);

        while(todo.length > 0) {
            // Find the first in todo that exists

            const indiCnx = this.context.indiManager.getValidConnection();

            const getFirstProp:()=>number|false = ()=>{
                let firstPropId = -1;
                for(let i = 0; i < todo.length; ++i) {
                    const t = todo[i];
                    const indivec = indiCnx.getDevice(t.dev).getVector(t.vec);
                    if (!indivec.exists()) {
                        continue;
                    }
                    firstPropId = i;
                    break;
                }
                return firstPropId === -1 ? false : firstPropId;
            }

            const firstPropId = await Timeout(ct,
                    async(ct:CancellationToken)=>{
                        return (await indiCnx.wait(ct, getFirstProp));
                    },
                    5000,
                    ()=>new Error("Not found: " + todo[0].dev + " " + todo[0].vec)
                );

            const dev = todo[firstPropId].dev;
            const vec = todo[firstPropId].vec;

            let lastPropId = firstPropId;
            while(lastPropId + 1 < todo.length
                    && todo[lastPropId + 1].dev === dev
                    && todo[lastPropId + 1].vec === vec)
            {
                lastPropId++;
            }

            // Update a vector at once.
            const props = todo.splice(firstPropId, lastPropId - firstPropId + 1);
            logger.debug("Applying vector", {firstPropId, lastPropId, props});

            const getVec = () => indiCnx.getDevice(dev).getVector(vec);

            try {
                await Timeout(ct,
                    async(ct:CancellationToken)=>{
                        return await indiCnx.wait(ct, () => (getVec().getState() != "Busy"));
                    },
                    10000,
                    ()=>new Error("Vector not becoming ready: " + dev + " " + vec)
                );

                const updateVecMessage: BackOfficeAPI.UpdateIndiVectorRequest = {
                    dev,
                    vec,
                    children: []
                };

                for(const prop of props) {
                    if (prop.prop === null) {
                        // Don't set a value that's already there
                        if (getVec().getFirstActivePropertyIfExists() === prop.wanted) {
                            continue;
                        }

                        // We want all vectors
                        updateVecMessage.children.push({
                            name: prop.wanted,
                            value: 'On'
                        });
                    } else {
                        if (getVec().getPropertyValueIfExists(prop.prop) === prop.wanted) {
                            continue;
                        }

                        updateVecMessage.children.push({
                            name: prop.prop,
                            value: prop.wanted
                        });
                    }
                }

                if (updateVecMessage.children.length) {
                    // Wait until the vector is ready
                    await this.context.indiManager.updateVector(ct, updateVecMessage);

                    await Timeout(ct,
                        async(ct:CancellationToken)=>{
                            return await indiCnx.wait(ct, () => (getVec().getState() != "Busy"));
                        },
                        20000,
                        ()=>new Error("Vector stays Busy: " + dev + " " + vec)
                    );
                }

                for(const prop of props) {
                    set3D(done, prop.dev, prop.vec, prop.prop === null ? "...whole_vector...": prop.prop, {success: true});
                }
            } catch(e) {
                if (e instanceof CancellationToken.CancellationError) {
                    throw e;
                }
                logger.error(`Error while updating vector: ${dev}.${vec}`, e);
                for(const prop of props) {
                    set3D(done, prop.dev, prop.vec, prop.prop === null ? "...whole_vector...": prop.prop, {success: false});
                }
            }
        }
    }

    readonly getAPI: () => RequestHandler.APIAppImplementor<BackOfficeAPI.IndiProfileAPI> =() => {
        return {
            createProfile: this.createProfile,
            deleteProfile: this.deleteProfile,
            updateProfile: this.updateProfile,
            addToProfile: this.addToProfile,
            removeFromProfile: this.removeFromProfile,
            applyActiveProfiles: this.applyActiveProfiles,
        }
    }
}