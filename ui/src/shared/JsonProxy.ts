'use strict';

/**
 * Created by ludovic on 21/07/17.
 */

// const objectId = (() => {
//     let currentId = 0;
//     const map = new WeakMap();

//     return (object:any) => {
//         if (object == null) return null;
//         if (object == undefined) return undefined;
//         if (!map.has(object)) {
//             map.set(object, ++currentId);
//         }

//         return map.get(object);
//     };
// })();

// // Each change in a node increments the serial of the node
// const serialProperty = "_$_serial_$_";
// // Reflect the "time" of creation of a node (global root)
// const createdProperty = "_$_created_$_";

// const missingProperty = "_$_missing_$_";


export function has(obj: any, key: string) {
    if (obj === null) {
        return false;
    }
    return Object.prototype.hasOwnProperty.call(obj, key);
}

/**
 * Represent a versioned JSON like object tree
 *
 * store for each property:
 *   * serial number
 *     * For final type (string, number, null) node the last "time" of assignment
 *     * For object/array, the time of creation of the object. The serial of childs is always>= to the serial of parents
 *   * childSerial (on object/array)
 *     * The max(serial) of all childs
 *
 * The actual storage for
 *   {  a: "x", b: {}, c: [] }
 * Will be
 *   {
 *      serial: 0
 *      childSerial: 3,
 *      value: {
 *          a:  {
 *              serial: 1
 *              value: "x";
 *          },
 *          b: {
 *              serial: 2
 *              value: {
 *                  childSerial: 2,
 *                  serial: 2,
 *                  value: {}
 *               }
 *          },
 *          c: {
 *              serial: 3
 *              value: {
 *                  childSerial: 3
 *                  serial: 3,
 *                  value: []
 *         }
 *      }
 *    }
 * When a node is created, it is created with the next serial
 * When a node is droped, the childSerial of the parent is updated
 *
 * Maintening a local copy can be performed at low cost, following the serial and childSerial changes
 * and the process can generate a json patch
 *
 * The api will be:
 *      snapshot() => x
 *      refreshSnapshot(x) => jsonpatch[]
 */
function valueHasChild(v:any)
{
    return v != null && (typeof v == "object");
}

function emptyObjectFor(v:any) {
    return Array.isArray(v) ? [] : {};
}

function compatibleStorage(a:any, b:any) {
    return Array.isArray(a) == Array.isArray(b);
}

export type ComposedSerialSnapshot = {
    serial: number|null;
    childSerial: number|undefined|null;
    props: {[id: string]:SerialSnapshot};
}
export type SerialSnapshot = ComposedSerialSnapshot | number;

export const NoWildcard = Symbol("TriggeredHere");

export type TriggeredWildcard = {
    [NoWildcard]?: boolean;
    [id:string]: TriggeredWildcard;
}

export type SynchronizerTriggerCallback = {
    pending: boolean;
    func: (where: TriggeredWildcard|undefined)=>(void);
    triggered: undefined | TriggeredWildcard;
    dead: boolean;
    path: any;
};

type JsonProxyNode = {
    parent: JsonProxyNode | null;
    value: any;
    serial : number;
    childSerial: number | undefined;
    proxy?: any;
}

function completeWildcardPath(path:string[] | undefined, n:string)
{
    if (path === undefined) {
        return path;
    }
    return path.concat([n]);
}

// Records all synchronizer listening for a node path
// Two instances kinds:
//   - nodes (callback === undefined)
//   - final (callback != undefined), found in a node.listeners
class SynchronizerTrigger {
    minSerial: number|undefined;
    minChildSerial: number|undefined;
    minSerialValue: number|undefined;
    readonly childsByProp?: {[id:string]:SynchronizerTrigger};
    callback: SynchronizerTriggerCallback | undefined;
    readonly listeners?: SynchronizerTrigger[];
    readonly wildcardChilds?: SynchronizerTrigger[];

    // When node is a wildcard root under a wildcard root, hold the values for wildcards
    callbackWildcardPath?: string[];

    // When the node is a wildcard root, keep track of the cb
    wildcardCallback: SynchronizerTriggerCallback | undefined;
    // When the node is a wildcard root, keep track of which childs have been applied
    wildcardAppliedToChilds?: {[id:string]:boolean};
    // For nodes created from wildcards
    wildcardOrigin: SynchronizerTrigger | undefined;

    constructor(cb: SynchronizerTriggerCallback | undefined, callbackWildcardPath?: string[]) {
        // The min of all childs (listeners, childsByProp, wildcardChilds)
        this.minSerial = undefined;
        this.minChildSerial = undefined;

        // Pour les listeners qui sont en fait des callback
        this.callback = cb;
        if (callbackWildcardPath) {
            this.callbackWildcardPath = callbackWildcardPath;
        }

        // The wildcard node that created this node
        // Valid for final and nodes in wildcardChilds
        this.wildcardOrigin = undefined;

        if (cb === undefined) {
            // Tous les fils sont des SynchronizerTrigger aussi

            // The listeners (all final)
            this.listeners = [];
            // The child nodes
            this.childsByProp = {};
            // A special node that get copie to every new child
            this.wildcardChilds = [];

            // List of properties known. Valid nodes within wildcardChilds
            this.wildcardAppliedToChilds = undefined;
        }
    }

    /**
     * @param target clone into that
     * @param content the actual data
     * @param wildcardOrigin: wildcardChild that creates the callbacks
     * @param forceInitialTrigger: true/false/null(means only for existing nodes)
     */
    cloneInto(target:SynchronizerTrigger, content:any, wildcardOrigin: any, forceInitialTrigger: boolean|null, wildcardPath?:string[]) {
        for(var o of this.listeners!) {
            var copy = new SynchronizerTrigger(o.callback, wildcardPath);
            copy.wildcardOrigin = wildcardOrigin;
            copy.copySerialFromContent(content, forceInitialTrigger);
            target.listeners!.push(copy);
        }

        for(var childId of Object.keys(this.childsByProp!)) {
            var childContent = this.getContentChild(content, childId);
            var childSynchronizerTrigger = this.childsByProp![childId];
            childSynchronizerTrigger.cloneInto(target.getChild(childId),childContent, wildcardOrigin, forceInitialTrigger, wildcardPath);
        }

        for(var wildcard of this.wildcardChilds!) {

            var wildcardCopy = new SynchronizerTrigger(undefined);
            wildcardCopy.wildcardOrigin = wildcard;
            wildcardCopy.wildcardAppliedToChilds = {};
            target.wildcardChilds!.push(wildcardCopy);

            wildcard.cloneInto(wildcardCopy, undefined, wildcardOrigin, false, wildcardPath);
        }

        target.updateMins();
    }


    getChild(propName: string):SynchronizerTrigger {
        if (this.callback !== undefined) throw "getChild not available on final node";

        if (!Object.prototype.hasOwnProperty.call(this.childsByProp, propName)) {
            this.childsByProp![propName] = new SynchronizerTrigger(undefined);

            this.childsByProp![propName].minSerial = this.minSerial;
            this.childsByProp![propName].minChildSerial = this.minSerialValue;
        }
        return this.childsByProp![propName];
    }

    copySerialFromContent(content:JsonProxyNode|undefined, forceInitialTrigger:boolean | null) {
        if (forceInitialTrigger === null) {
            forceInitialTrigger = content !== undefined;
        }

        if (forceInitialTrigger) {
            this.minChildSerial = -1;
            this.minSerial = -1;
        } else if (content !== undefined) {
            if (this.minChildSerial === undefined) {
                this.minChildSerial = content.childSerial;
            }
            if (this.minSerial === undefined) {
                this.minSerial = content.serial;
            }
        } else {
            // Don't need to touch existing registration (for existing callback)
        }
    }

    addToPath(parentContent: any, cb: SynchronizerTriggerCallback, path:any, startAt:number, forceInitialTrigger:boolean, callbackWildcardPath?: string[]) {
        if (forceInitialTrigger) {
            this.minChildSerial = -1;
            this.minSerial = -1;
        }

        if (startAt == path.length) {
            // Add a listener
            const nv = new SynchronizerTrigger(cb, callbackWildcardPath);
            this.listeners!.push(nv);
            this.copySerialFromContent(parentContent, forceInitialTrigger);

            return;
        }
        var step = path[startAt];
        if (Array.isArray(step)) {
            for(let o of step) {
                if (!Array.isArray(o)) {
                    throw new Error("invalid path in multi-path. Array of array");
                }
                this.addToPath(parentContent, cb, o, 0, forceInitialTrigger, callbackWildcardPath);
            }
            return;
        }
        // Wildcard
        if (step === null || step === undefined) {
            let wildcardChild = new SynchronizerTrigger(undefined);
            wildcardChild.wildcardCallback = cb;
            wildcardChild.wildcardAppliedToChilds = {};
            wildcardChild.callbackWildcardPath = callbackWildcardPath;
            wildcardChild.addToPath(undefined, cb, path, startAt + 1, false);

            for(let o of this.getContentChilds(parentContent)) {
                // Create triggers that must trigger depending on forceInitialTrigger
                wildcardChild.wildcardAppliedToChilds[o] = true;
                wildcardChild.cloneInto(this.getChild(o), this.getContentChild(parentContent, o), wildcardChild, forceInitialTrigger, completeWildcardPath(callbackWildcardPath, o));
            }

            this.wildcardChilds!.push(wildcardChild);

            return;
        }
        // named child
        var childContent = this.getContentChild(parentContent, step);
        this.getChild(step).addToPath(childContent, cb, path, startAt + 1, forceInitialTrigger, callbackWildcardPath);
    }

    killListenersOf(triggers: Array<SynchronizerTrigger>, cb: SynchronizerTriggerCallback): boolean {
        let ret = false;
        for(let i = 0; i < triggers.length;) {
            const t = triggers[i];
            if (t.callback === cb) {
                ret = true;
                triggers.splice(i, 1);
            } else {
                i++;
            }
        }
        return ret && triggers.length === 0;
    }

    killWildcardListenersOf(triggers: Array<SynchronizerTrigger>, cb: SynchronizerTriggerCallback): boolean {
        let ret = false;
        for(let i = 0; i < triggers.length;) {
            const t = triggers[i];
            if (t.wildcardCallback === cb) {
                ret = true;
                triggers.splice(i, 1);
            } else {
                i++;
            }
        }
        return ret && triggers.length === 0;
    }

    // Check if there are still valid listener
    isEmpty() {
        if (this.callback !== undefined) {
            return false;
        }

        if (this.listeners!.length) {
            return false;
        }
        if (this.wildcardChilds!.length) {
            return false;
        }
        if (Object.keys(this.childsByProp!).length) {
            return false;
        }
        return true;
    }

    // Return true if the node may have become empty
    removeListener(cb: SynchronizerTriggerCallback, path:any, startAt:number) {
        let ret: boolean = false;
        if (startAt == path.length) {
            return this.killListenersOf(this.listeners!, cb);
        }

        var step = path[startAt];
        if (Array.isArray(step)) {
            for(let o of step) {
                if (!Array.isArray(o)) {
                    throw new Error("invalid path in multi-path. Array of array");
                }
                if (this.removeListener(cb, o, 0)) {
                    ret = true;
                }
            }
            return ret;
        }
        // Wildcard
        if (step === null || step === undefined) {
            for(const childId of Object.keys(this.childsByProp!)) {
                const child = this.childsByProp![childId];
                if (child.removeListener(cb, path, startAt + 1)) {
                    if (child.isEmpty()) {
                        delete this.childsByProp![childId];
                        ret = true;
                    }
                }
            }

            if (this.killWildcardListenersOf(this.wildcardChilds!, cb)) {
                ret = ret || this.wildcardChilds!.length === 0;
            }

            return ret;
        }

        // named child
        if (Object.prototype.hasOwnProperty.call(this.childsByProp, step)) {
            const child = this.childsByProp![step];
            if (child.removeListener(cb, path, startAt + 1)) {
                if (child.isEmpty()) {
                    delete this.childsByProp![step];
                    ret = true;
                }
            }
        }
        return ret;
    }

    updateMin(prop:'minSerial' | 'minChildSerial') {
        var realMin = undefined;
        for(let listener of this.listeners!) {
            const lval = listener[prop];
            if (lval === undefined) continue;
            if ((realMin === undefined || ((lval !== undefined) && (lval < realMin)))) {
                realMin = lval;
            }
        }
        for(let lid of Object.keys(this.childsByProp!)) {
            const listener = this.childsByProp![lid];
            const lval = listener[prop];
            if (lval === undefined) continue;
            if ((realMin === undefined || ((lval !== undefined) && (lval < realMin)))) {
                realMin = lval;
            }
        }
        this[prop] = realMin;

    }

    updateMins() {
        this.updateMin('minSerial');
        this.updateMin('minChildSerial');
    }

    getContentChilds(content: JsonProxyNode) {
        if (content == undefined) {
            return [];
        }
        var contentObj = content.value;
        if (contentObj === null || (typeof(contentObj) != 'object')) {
            return [];
        } else {
            return Object.keys(contentObj);
        }
    }

    getContentChild(content: JsonProxyNode|undefined, childId: string):any {
        var childContent;
        if (content === undefined) {
            childContent = undefined;
        } else {
            var contentObj = content.value;
            if (contentObj === null || (typeof(contentObj) != 'object')) {
                childContent = undefined;
            } else if (!Object.prototype.hasOwnProperty.call(contentObj, childId)) {
                childContent = undefined;
            } else {
                childContent = contentObj[childId];
            }
        }
        return childContent;
    }

    getInstalledCallbackCount(cb : SynchronizerTriggerCallback) {
        return this.getInstalledCallbacks(cb).length;
    }

    getInstalledCallbacks(cb : SynchronizerTriggerCallback):string[] {
        var result = [];
        for(var o of this.listeners!) {
            if (o.callback === cb) {
                result.push('');
            }
        }
        for(var key of Object.keys(this.childsByProp!)) {
            for(var path of this.childsByProp![key].getInstalledCallbacks(cb))
            {
                result.push(key + '/' + path);
            }
        }
        return result;
    }

    getEmptyPath() {
        var result = [];

        for (var k of Object.keys(this.childsByProp!)) {
            for(var path of this.childsByProp![k].getEmptyPath()) {
                result.push(k + "/" + path);
            }
        }
        for (var w of this.wildcardChilds!) {
            for(var path of w.getEmptyPath()) {
                result.push('*/' + path);
            }
        }
        if (this.listeners!.length || this.childsByProp!.length || this.wildcardChilds!.length) {
            return [];
        }
        return [''];
    }


    // Put every newly ready callback into result.
    // Update the minSerial/minChildSerial according
    // return true when something was done
    findReadyCallbacks(content: JsonProxyNode, result: SynchronizerTriggerCallback[]) {
        var contentSerial = content === undefined ? undefined : content.serial;
        var contentChildSerial = content === undefined ? undefined : content.childSerial;

        if ((contentSerial === this.minSerial)
            && (contentChildSerial === this.minChildSerial))
        {
            return false;
        }

        var ret = false;
        var changed = false;

        if (this.callback !== undefined) {
            this.minSerial = contentSerial;
            this.minChildSerial = contentChildSerial;
            if (this.callbackWildcardPath !== undefined) {
                let root = this.callback.triggered;
                if (root === undefined) {
                    root = {};
                    this.callback.triggered = root;
                }
                for(const o of this.callbackWildcardPath) {
                    if (!has(root, o)) {
                        root[o] = {};
                    }
                    root = root[o];
                }
                root[NoWildcard] = true;
            }
            if (!this.callback.pending) {
                this.callback.pending = true;
                result.push(this.callback);
            }
            ret = true;
        } else {
            // Direct calls to listeners
            for (let o of this.listeners!) {
                if (o.findReadyCallbacks(content, result)) {
                    ret = true;
                }
            }

            for(let wildcardChild of this.wildcardChilds!) {
                // Ensure that all childs exists where template applied
                // FIXME: use serial and childSerial
                for(let o of this.getContentChilds(content)) {
                    // Create triggers that must trigger if key exists
                    if (!Object.prototype.hasOwnProperty.call(wildcardChild.wildcardAppliedToChilds, o)) {
                        wildcardChild.wildcardAppliedToChilds![o] = true;
                        wildcardChild.cloneInto(this.getChild(o), this.getContentChild(content, o), wildcardChild, null, completeWildcardPath(wildcardChild.callbackWildcardPath, o));
                    }
                }
            }

            // Calls to childs
            for (var childId of Object.keys(this.childsByProp!)) {
                var childContent = this.getContentChild(content, childId);

                var childSynchronizerTrigger = this.childsByProp![childId];
                if (childSynchronizerTrigger.findReadyCallbacks(childContent, result)) {
                    ret = true;
                }

                // FIXME: will be done for each run - use serial for wildcards ?
                if (childContent === undefined) {
                    // Deinstanciate every wildcard
                    for(var wildcard of this.wildcardChilds!) {
                        if (Object.prototype.hasOwnProperty.call(wildcard.wildcardAppliedToChilds, childId)) {

                            var wildcardChanged = childSynchronizerTrigger.removeFromWildcard(wildcard);

                            delete wildcard.wildcardAppliedToChilds![childId];

                            // Adjust serial required ?
                            changed = changed || !!wildcardChanged;

                            // Nothing left. probably done with wildcardChilds !
                            if (wildcardChanged == 2) {
                                delete this.childsByProp![childId];
                                // Could break, but continue in case of empty wildcard
                            }
                        }
                    }
                }
            }


            if (ret || changed) {
                this.updateMins();
            }
        }

        return ret;
    }

    // 0: nothing changed
    // 1 : changed but not empty
    // 2 : changed and became empty
    removeFromWildcard(originToRemove:any) {
        var isEmpty = true;
        var sthChanged = false;
        for(var i = 0; i < this.listeners!.length; ) {
            if (this.listeners![i].wildcardOrigin == originToRemove) {
                this.listeners![i] = this.listeners![this.listeners!.length - 1];
                this.listeners!.splice(-1, 1);
                sthChanged = true;
            } else {
                i++;
                isEmpty = false;
            }
        }

        for(var o of Object.keys(this.childsByProp!)) {
            var child =  this.childsByProp![o];
            var childRemoveResult = child.removeFromWildcard(originToRemove);
            if (childRemoveResult) {
                sthChanged = true;
                if (childRemoveResult == 2) {
                    delete this.childsByProp![o];
                } else {
                    isEmpty = false;
                }
            } else {
                isEmpty = false;
            }
        }

        for(let i = 0; i < this.wildcardChilds!.length; ) {
            if( this.wildcardChilds![i].wildcardOrigin == originToRemove) {
                this.wildcardChilds![i] = this.wildcardChilds![this.wildcardChilds!.length - 1];
                this.wildcardChilds!.splice(-1, 1);
                sthChanged = true;
            } else {
                i++;
                isEmpty = false;
            }
        }
        if (isEmpty) {
            return 2;
        }
        return sthChanged ? 1 : 0;
    }
}

type Callback = ()=>(void);
type ListenerId = string;

type NewArrayDiff = {
    newArray: {[id: string]:Diff};
}

type NewObjectDiff = {
    newObject: {[id: string]:Diff};
}

type UpdateDiff = {
    update: {[id: string]:Diff};
    delete?: string[];
}

export type WhiteList = undefined | {
    [id: string]: boolean|WhiteList
};

function whiteListAcceptProps(whiteList : WhiteList, key: string) {
    if (whiteList === undefined) {
        return true;
    }
    if (!has(whiteList, key)) {
        return false;
    }
    return whiteList[key];
}

function whiteListChild(whiteList : WhiteList, key: string) : WhiteList | null {
    if (whiteList === undefined) {
        return undefined;
    }
    if (!has(whiteList, key)) {
        return null;
    }
    const ret = whiteList[key];
    if (ret === false) {
        return null;
    }
    if (ret === true) {
        return undefined;
    }
    return ret;
}

export type Diff = number | string | boolean | null | NewArrayDiff | NewObjectDiff | UpdateDiff;

export default class JsonProxy<CONTENTTYPE> {
    root: JsonProxyNode;
    currentSerial: number;
    currentSerialUsed: boolean;
    notifyPending: boolean;
    listeners: {[id:string]:Callback};
    listenerId: number;
    synchronizerRoot: SynchronizerTrigger;

    newNode(parent: JsonProxyNode|null, emptyValue : any): JsonProxyNode {
        var details : JsonProxyNode = {
            parent : parent,
            value: emptyValue,
            serial: this.currentSerial,
            childSerial: undefined
        };
        this.useCurrentSerial();
        this.markDirty(details);
        return details;
    }

    useCurrentSerial() {
        if (!this.currentSerialUsed) {
            this.currentSerialUsed = true;
            if (!this.notifyPending) {
                this.notifyPending = true;
                process.nextTick(this.notifyAll);
            }
        }
    }

    notifyAll() {
        this.flushSynchronizers();
        this.notifyPending = false;

        var toCall = Object.assign({}, this.listeners);
        for (var k of Object.keys(toCall)) {
            if (has(toCall, k) && has(this.listeners, k)) {
                toCall[k]();
            }
        }
    }

    // Create a node with emptyValue as storage
    newObjectNode(parent: JsonProxyNode|null, emptyValue: Object) {
        if ((typeof emptyValue) != 'object') throw new Error("Object node must have object");
        var details = this.newNode(parent, emptyValue);
        this.toObjectNode(details);
        return details;
    }


    addSynchronizer(path: any, callback: (to:TriggeredWildcard)=>(void), forceInitialTrigger: boolean, locateWidlcards: true):SynchronizerTriggerCallback
    addSynchronizer(path: any, callback: ()=>(void), forceInitialTrigger: boolean):SynchronizerTriggerCallback

    // Example: to be called on every change of the connected property in indiManager
    // addSynchronizer({'indiManager':{deviceTree':{$@: {'CONNECTION':{'childs':{'CONNECT':{'$_': true}}}} )
    // forceInitialTriggering
    addSynchronizer(path: any, callback: (to:TriggeredWildcard)=>(void), forceInitialTrigger:boolean, locateWidlcards?: boolean):SynchronizerTriggerCallback {
        if (this.currentSerialUsed) {
            this.currentSerial++;
            this.currentSerialUsed = false;
        }
        const listener : SynchronizerTriggerCallback = {
            func: callback as any,
            pending: false,
            dead: false,
            triggered: {},
            path
        };

        this.synchronizerRoot.addToPath(this.root, listener, path, 0, forceInitialTrigger, locateWidlcards ? [] : undefined);

        return listener;
    }

    // Call untils no more synchronizer is available
    flushSynchronizers() {
        do {
            if (this.currentSerialUsed) {
                this.currentSerial++;
                this.currentSerialUsed = false;
            }
            let todoList: SynchronizerTriggerCallback[] = [];
            this.synchronizerRoot.findReadyCallbacks(this.root, todoList);
            if (!todoList.length) {
                return;
            }
            for(let cb of todoList) {
                // FIXME :check callback is not dead
                if (cb.dead) {
                    continue;
                }
                cb.pending = false;
                const triggered = cb.triggered;
                cb.triggered = undefined;
                cb.func(triggered);
            }
        } while(true);
    }

    removeSynchronizer(trigger: SynchronizerTriggerCallback) {
        if (trigger === undefined || trigger.dead) {
            return;
        }
        trigger.dead = true;
        this.synchronizerRoot.removeListener(trigger, trigger.path, 0);
    }

    addListener(listener:Callback): ListenerId{
        var key = "" + this.listenerId++;
        this.listeners[key] = listener;
        return key;
    }

    removeListener(listenerId : ListenerId) {
        delete this.listeners[listenerId];
    }

    toSimpleNode(details: JsonProxyNode) {
        delete details.proxy;
        delete details.childSerial;
    }

    toObjectNode(details: JsonProxyNode)
    {
        var self = this;
        // Create the proxy
        var handler = {
            get: function(target:any, nom:string) {
                if (has(details.value, nom)) {
                    var desc = details.value[nom];

                    if (Array.isArray(target) && nom == "length") {
                        return desc;
                    }

                    if ("proxy" in desc) {
                        return desc.proxy;
                    }
                    return desc.value;
                }
                return details.value[nom];
            },
            deleteProperty: function(target:any, nom:string) {
                if (has(details.value, nom)) {
                    var currentDesc = details.value[nom];
                    self.markDirty(currentDesc);
                }
                delete details.value[nom];
                return true;
            },
            set: function(target:any, nom:string, newValue:any, receiver:any) {
                if (Array.isArray(target) && nom == "length") {
                    target[nom] = newValue;
                    return true;
                }

                // Value is set
                if (newValue === undefined) {
                    throw new Error("undefined not supported in JSON");
                }

                var currentDesc = has(details.value, nom) ? details.value[nom] : undefined;

                // Just create the node
                if (currentDesc == undefined) {
                    if (valueHasChild(newValue)) {
                        currentDesc = self.newObjectNode(details, emptyObjectFor(newValue));
                        // Then merge
                        self.mergeValues(newValue, currentDesc.proxy);
                    } else {
                        currentDesc = self.newNode(details, newValue);
                    }
                    details.value[nom] = currentDesc;
                } else {
                    if (currentDesc.value === newValue) {
                        return true;
                    }

                    // Update existing value.
                    if (!valueHasChild(newValue)) {
                        if (currentDesc.proxy != undefined) {
                            self.toSimpleNode(currentDesc);
                            currentDesc.value = null;
                            self.markDirty(currentDesc);
                        }
                        if (currentDesc.value != newValue) {
                            currentDesc.value = newValue;
                            self.markDirty(currentDesc);
                        }
                    } else {
                        // Ensure storage is compatible
                        if ((!valueHasChild(currentDesc.value)) || !compatibleStorage(currentDesc.value, newValue)) {
                            // Just drop the existing node
                            currentDesc.value = emptyObjectFor(newValue);
                            self.toObjectNode(currentDesc);
                            self.markDirty(currentDesc);
                        }
                        // Then merge
                        self.mergeValues(newValue, currentDesc.proxy);
                    }
                }

                return true;
            }
        };

        details.proxy = new Proxy(details.value, handler);
        details.childSerial = this.currentSerial;
        this.useCurrentSerial();

        return details;
    }

    // Mark the value of a node "dirty"
    markDirty(details: JsonProxyNode) {
        this.useCurrentSerial();
        details.serial = this.currentSerial;
        while(details.parent != null) {
            details = details.parent;
            if (details.childSerial == this.currentSerial) return;
            details.childSerial = this.currentSerial;
        }
    }



    mergeValues(from: any, intoProxy: any)
    {
        if (Array.isArray(intoProxy)) {
            intoProxy.length = from.length;
            for(var i = 0; i < from.length; ++i) {
                intoProxy[i] = from[i];
            }
        } else {
            // Assure que intoProxy contient bien toutes les propriété de from, ...
            // if (typeof intoProxy == 'array') throw new Error("Not implemented");
            for(var k of Object.keys(from)) {
                intoProxy[k] = from[k];
            }
            for(var k of Object.keys(intoProxy)) {
                if (!(k in from)) {
                    delete intoProxy[k];
                }
            }
        }
    }

    constructor() {
        var self = this;
        this.currentSerial = 0;
        this.currentSerialUsed = false;
        this.notifyPending = false;

        this.notifyAll = this.notifyAll.bind(this);

        this.root = this.newObjectNode(null, {})
        this.listeners = {};
        this.listenerId = 1;

        this.synchronizerRoot = new SynchronizerTrigger(undefined);
    }


    takeSerialSnapshot(whiteList?:  WhiteList):ComposedSerialSnapshot
    {
        var self = this;
        if (this.currentSerialUsed) {
            this.currentSerial++;
            this.currentSerialUsed = false;
        }

        function forObject(desc:JsonProxyNode, whiteList: WhiteList) : SerialSnapshot
        {
            if (valueHasChild(desc.value)) {
                var result = {
                    serial: desc.serial,
                    childSerial: desc.childSerial,
                    props: {}
                };
                for(var k of Object.keys(desc.value)) {
                    const childWhitelist =
                        whiteList === undefined
                            ? undefined
                            : has(whiteList, k) ? whiteList[k] : false;

                    if (childWhitelist === false) {
                        continue;
                    }
                    (result.props as any)[k] = forObject(desc.value[k], childWhitelist === true ? undefined : childWhitelist);
                }
                return result;
            } else {
                return desc.serial;
            }
        }
        return forObject(this.root, whiteList) as ComposedSerialSnapshot;
    }

    // Update version and returns a list of op
    diff(version: ComposedSerialSnapshot, whiteList?:  WhiteList) {

        // Return an array of change, and update objVersion
        //  { newArray: {} }
        //  { newObject: {} }
        //  { update: {
        //          prop: value,
        //          prop: value,
        //          prop: // Meme chose
        //      },
        //    delete: [x, y, z]
        //  }
        //  null si no update is required
        function objectProps(objDesc: JsonProxyNode, objVersion: ComposedSerialSnapshot, whiteList: WhiteList) {
            let result: Diff;
            let whereToStoreProps : {[id:string]:any};
            let emptyResult = true;
            // Ignorer objVersion si il n'est pas compatible
            // Pas de changement
            if (objVersion.serial != objDesc.serial) {
                whereToStoreProps = {};
                if (Array.isArray(objDesc.value)) {
                    result = {newArray : whereToStoreProps};
                } else {
                    result = {newObject : whereToStoreProps};
                }
                // Reset everything in objVersion
                objVersion.serial = objDesc.serial;
                objVersion.childSerial = objDesc.childSerial;
                objVersion.props = {};
                emptyResult = false;
            } else {
                if (objVersion.childSerial == objDesc.childSerial) {
                    // Same serials
                    return undefined;
                }
                objVersion.childSerial = objDesc.childSerial;
                whereToStoreProps = {};
                result = { update : whereToStoreProps};

                // Find the properties to remove
                var toDelete = [];
                for (var key of Object.keys(objVersion.props)) {
                    if (!has(objDesc.value, key)) {
                        toDelete.push(key);
                    } else if (!whiteListAcceptProps(whiteList, key)) {
                        toDelete.push(key);
                    }
                }

                if (toDelete.length != 0) {
                    emptyResult = false;
                    for(var i = 0; i < toDelete.length; ++i) {
                        delete objVersion.props[toDelete[i]];
                    }
                    result.delete = toDelete;
                }
            }

            for(var key of Object.keys(objDesc.value)) {
                const childWhiteList = whiteListChild(whiteList, key);
                if (childWhiteList === null) {
                    continue;
                }

                // Verifier la prop
                var propObjDesc = objDesc.value[key];


                var propUpdate;
                // On a affaire a un objet
                if ('proxy' in propObjDesc) {
                    var propObjVersion = undefined;
                    if (has(objVersion.props, key)) {
                        propObjVersion = objVersion.props[key];
                        if (typeof propObjVersion != "object") {
                            propObjVersion = undefined;
                        }
                    }

                    if (propObjVersion == undefined) {
                        propObjVersion = {serial: null, childSerial: null, props: {}}
                        objVersion.props[key] = propObjVersion;
                    }

                    propUpdate = objectProps(propObjDesc, propObjVersion, childWhiteList);
                } else {

                    propUpdate = finalProp(propObjDesc, objVersion, key);
                }
                if (propUpdate !== undefined) {
                    emptyResult = false;
                    whereToStoreProps[key] = propUpdate;
                }
            }

            if (emptyResult) {
                return undefined;
            }

            return result;
        }

        function finalProp(objDesc:any, objVersion:ComposedSerialSnapshot, key: string) {
            var versionSerial;
            if (has(objVersion.props, key)) {
                versionSerial = objVersion.props[key];
                if (typeof versionSerial == "object") {
                    versionSerial = undefined;
                }
            } else {
                versionSerial = undefined;
            }

            if (objDesc.serial == versionSerial) {
                return undefined;
            }

            objVersion.props[key] = objDesc.serial;
            return objDesc.value;
        }

        if (this.currentSerialUsed) {
            this.currentSerial++;
            this.currentSerialUsed = false;
        }

        return objectProps(this.root, version, whiteList);
    }

    getTarget():CONTENTTYPE {
        return this.root.proxy;
    }

    fork(whiteList?:WhiteList):{data: CONTENTTYPE, serial: ComposedSerialSnapshot} {
        if (this.currentSerialUsed) {
            this.currentSerial++;
            this.currentSerialUsed = false;
        }

        return {
            data: JSON.parse(JSON.stringify(this.root.proxy)),
            serial: this.takeSerialSnapshot(whiteList)
        }
    }

    public static asDiff(value:any):Diff
    {
        if (typeof value == 'number' || typeof value == 'string' || typeof value == 'boolean' || value === null) {
            return value;
        }
        if (typeof value != 'object') {
            throw new Error("Unsupported value:" + value);
        }
        if (Array.isArray(value)) {
            const result: {[id:string]:Diff} = {};
            for(let i = 0; i < value.length; ++i) {
                // FIXME: asDiff(value[i]) ???
                result[i] = value[i];
            }
            return {newArray: result};
        }
        return {newObject: value};
    }

    // Update an object
    public static applyDiff(from : any, diff: Diff) {
        if (diff === undefined) {
            return from;
        }
        if (typeof diff == 'number' || typeof diff == 'string' || typeof diff == 'boolean' || diff === null) {
            return diff;
        }
        let updateProps: undefined | {[id: string]:Diff} = undefined;
        if (has(diff, 'newArray')) {
            updateProps = (diff as NewArrayDiff).newArray;
            from = [];
        } else if (has(diff, 'newObject')) {
            updateProps = (diff as NewObjectDiff).newObject;
            from = {};
        } else if (has(diff, 'update')) {
            updateProps = (diff as UpdateDiff).update;
            if (Array.isArray(from)) {
                from = from.slice();
            } else {
                from = Object.assign({}, from);
            }

            if (has(diff, 'delete')) {
                var toDelete = (diff as UpdateDiff).delete!;
                if (Array.isArray(from)) {
                    var lowestDelete = from.length;
                    for(var i = 0; i < toDelete.length; ++i) {
                        var id = parseInt(toDelete[i]);
                        if (i == 0 || id < lowestDelete) {
                            lowestDelete = id;
                        }
                    }
                    from.splice(lowestDelete);
                } else {
                    for(var i = 0; i < toDelete.length; ++i) {
                        delete from[toDelete[i]];
                    }
                }
            }
        }

        if (updateProps != undefined) {
            for(var k of Object.keys(updateProps)) {
                if (has(updateProps, k)) {
                    from[k] = JsonProxy.applyDiff(has(from, k) ? from[k] : undefined, updateProps[k]);
                }
            }
        }
        return from;
    }
}



