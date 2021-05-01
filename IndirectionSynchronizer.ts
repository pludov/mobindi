import { WildcardAccessPath } from "./AccessPath";
import JsonProxy, { NoWildcard, SynchronizerTriggerCallback, TriggeredWildcard } from "./JsonProxy";
import Log from './Log';
import * as Obj from "./Obj";

const logger = Log.logger(__filename);

const NotFound = new Object();

// Read an adress from an indiproperty and dynamically register watchers for it
// ROOT is backofficeStatus
// POINTER: is IndiProperty
export default class IndirectionSynchronizer<ROOT, POINTER> {
    private readonly appStateManager: JsonProxy<ROOT>;
    private readonly pointerPath: Array<string|null>;
    private readonly hasWildcard: boolean;
    private readonly listenBuilder: (wildcardValues: string, pointer: POINTER)=>SynchronizerTriggerCallback|null;
    private readonly synchronizerByPath: {[wildcardValues: string]: {listenFor: POINTER, cb: SynchronizerTriggerCallback|null}} = {};

    // pointerPath is limited to one wildcard
    constructor(appStateManager: JsonProxy<ROOT>,
                pointerPath: WildcardAccessPath<ROOT, POINTER>,
                listenBuilder: (wildcardValues: string, pointer: POINTER)=>SynchronizerTriggerCallback|null)
    {
        this.appStateManager = appStateManager;
        this.pointerPath = pointerPath.path;
        this.listenBuilder = listenBuilder;
        let nullFound = false;
        for(const v of this.pointerPath) {
            if (v === null) nullFound = true;
        }
        this.hasWildcard = nullFound;
        this.appStateManager.addSynchronizer(
            this.pointerPath,
            this.updateProperties,
            true, true);
    }

    getCurrentWildCardValues() {
        if (!this.hasWildcard) {
            return [""];
        }

        let pointer:any = this.appStateManager.getTarget();
        for(const v of this.pointerPath) {
            if ((typeof pointer !== "object") || pointer === null) {
                logger.debug('Not an object', {v, pointer})
                return [];
            }
            if (v === null) {
                return Object.keys(pointer);
            }
            if (!Obj.hasKey(pointer, v)) {
                logger.debug('Key not found', {v, pointer})
                return [];
            }
            pointer = pointer[v];
        }
        throw new Error("wildcard not found");
    }

    getPointer(uid: string):POINTER|typeof NotFound {
        let pointer:any = this.appStateManager.getTarget();
        for(let v of this.pointerPath) {
            if ((typeof pointer !== "object") || pointer === null) {
                return NotFound;
            }
            if (v === null) {
                v = uid;
                if (!Obj.hasKey(pointer, v)) {
                    return NotFound;
                }
            }
            pointer = pointer[v];
        }
        return pointer;
    }

    addRemoveSynchronizer(uuid: string) {
        let needDelete: boolean = false;
        let needCreate: boolean = false;

        if (this.getCurrentWildCardValues().indexOf(uuid) === -1) {
            needDelete = true;
        } else if (!Obj.hasKey(this.synchronizerByPath, uuid)) {
            needCreate = true;
        } else {
            const wantingProperty = this.getPointer(uuid);
            const currentProperty = this.synchronizerByPath[uuid].listenFor;

            if (Obj.deepEqual(wantingProperty, currentProperty)) {
                return;
            }
            needDelete = true;
            needCreate = true;
        }

        if (needDelete||needCreate) {
            if (Obj.hasKey(this.synchronizerByPath, uuid)) {
                const cb = this.synchronizerByPath[uuid].cb;
                if (cb !== null) {
                    this.appStateManager.removeSynchronizer(cb);
                }
                delete this.synchronizerByPath[uuid];
            }
        }

        if (needCreate) {
            const wantingProperty = this.getPointer(uuid);
            if (wantingProperty === NotFound) {
                return;
            }
            this.synchronizerByPath[uuid] = {
                listenFor: Obj.deepCopy(wantingProperty as POINTER),
                cb: this.listenBuilder(uuid, wantingProperty as POINTER),
            }
        }
    }

    updateProperties=(where: TriggeredWildcard)=>{
        logger.debug('Triggering ', where);
        let toInspect : string[];
        if (where[NoWildcard]) {
            toInspect = Object.keys({
                    ...this.synchronizerByPath,
                    ...this.getCurrentWildCardValues(),
            });
        } else {
            toInspect = Object.keys(where);
        }

        for(const uuid of toInspect) {
            this.addRemoveSynchronizer(uuid);
        }
    }
}
