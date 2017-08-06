'use strict';

/**
 * Created by ludovic on 21/07/17.
 */

const objectId = (() => {
    let currentId = 0;
    const map = new WeakMap();

    return (object) => {
        if (object == null) return null;
        if (object == undefined) return undefined;
        if (!map.has(object)) {
            map.set(object, ++currentId);
        }

        return map.get(object);
    };
})();

// Each change in a node increments the serial of the node
const serialProperty = "_$_serial_$_";
// Reflect the "time" of creation of a node (global root)
const createdProperty = "_$_created_$_";

const missingProperty = "_$_missing_$_";


function has(obj, key) {
    if (obj === null) return false;
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
function valueHasChild(v)
{
    return v != null && (typeof v == "object");
}

function emptyObjectFor(v) {
    return Array.isArray(v) ? [] : {};
}

function compatibleStorage(a, b) {
    return Array.isArray(a) == Array.isArray(b);
}


// Records all synchronizer listening for a node path
// Two instances kinds:
//   - nodes (callback === undefined)
//   - final (callback != undefined), found in a node.listeners
class SynchronizerTrigger {

    constructor(cb) {
        // The min of all childs (listeners, childsByProp, wildcardChilds)
        this.minSerial = undefined;
        this.minChildSerial = undefined;

        // Pour les listeners qui sont en fait des callback
        this.callback = cb;

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
    cloneInto(target, content, wildcardOrigin, forceInitialTrigger) {
        for(var o of this.listeners) {
            var copy = new SynchronizerTrigger(o.callback);
            copy.wildcardOrigin = wildcardOrigin;
            copy.copySerialFromContent(content, forceInitialTrigger);
            target.listeners.push(copy);
        }

        for(var childId of Object.keys(this.childsByProp)) {
            var childContent = this.getContentChild(content, childId);
            var childSynchronizerTrigger = this.childsByProp[childId];
            childSynchronizerTrigger.cloneInto(target.getChild(childId),childContent, wildcardOrigin, forceInitialTrigger);
        }

        for(var wildcard of this.wildcardChilds) {

            var wildcardCopy = new SynchronizerTrigger(undefined);
            wildcardCopy.wildcardOrigin = wildcard;
            wildcardCopy.wildcardAppliedToChilds = {};

            target.wildcardChilds.push(wildcardCopy);

            wildcard.cloneInto(wildcardCopy, undefined, wildcardOrigin, false);
        }

        target.updateMins();
    }


    getChild(propName) {
        if (this.callback !== undefined) throw "getChild not available on final node";

        if (!Object.prototype.hasOwnProperty.call(this.childsByProp, propName)) {
            this.childsByProp[propName] = new SynchronizerTrigger();

            this.childsByProp[propName].minSerial = this.minSerial;
            this.childsByProp[propName].minChildSerial = this.minSerialValue;
        }
        return this.childsByProp[propName];
    }

    copySerialFromContent(content, forceInitialTrigger) {
        if (forceInitialTrigger === null) {
            forceInitialTrigger = content !== undefined;
        }

        if (forceInitialTrigger) {
            this.minChildSerial = -1;
            this.minSerial = -1;
        } else if (content !== undefined) {
            this.minChildSerial = content.childSerial;
            this.minSerial = content.serial;
        } else {
            this.minChildSerial = undefined;
            this.minSerial = undefined;
        }
    }

    addToPath(parentContent, cb, path, startAt, forceInitialTrigger) {
        if (forceInitialTrigger) {
            this.minChildSerial = -1;
            this.minSerial = -1;
        }

        if (startAt == path.length) {
            // Add a listener
            var nv = new SynchronizerTrigger(cb);
            this.listeners.push(nv);
            this.copySerialFromContent(parentContent, forceInitialTrigger);

            return nv;
        }
        var step = path[startAt];
        if (Array.isArray(step)) {
            for(var o of step) {
                if (!Array.isArray(o)) {
                    throw new Error("invalid path in multi-path. Array of array");
                }
                this.addToPath(parentContent, cb, o, 0, forceInitialTrigger);
            }
            return;
        }
        // Wildcard
        if (step === null || step === undefined) {
            var wildcardChild = new SynchronizerTrigger();
            wildcardChild.wildcardAppliedToChilds = {};
            wildcardChild.addToPath(undefined, cb, path, startAt + 1, false);

            for(var o of this.getContentChilds(parentContent)) {
                // Create triggers that must trigger depending on forceInitialTrigger
                wildcardChild.wildcardAppliedToChilds[o] = true;
                wildcardChild.cloneInto(this.getChild(o), this.getContentChild(parentContent, o), wildcardChild, forceInitialTrigger);
            }

            this.wildcardChilds.push(wildcardChild);

            return;
        }
        // named child
        var childContent = this.getContentChild(parentContent, step);
        this.getChild(step).addToPath(childContent, cb, path, startAt + 1, forceInitialTrigger);
    }

    updateMin(prop) {
        var realMin = undefined;
        for(var listener of this.listeners) {
            var lval = listener[prop];
            if (lval === undefined) continue;
            if ((realMin === undefined || ((lval !== undefined) && (lval < realMin)))) {
                realMin = lval;
            }
        }
        for(var lid of Object.keys(this.childsByProp)) {
            var listener = this.childsByProp[lid];
            var lval = listener[prop];
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

    getContentChilds(content) {
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

    getContentChild(content, childId) {
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

    getInstalledCallbackCount(cb) {
        var result = 0;
        for(var o of this.listeners) {
            if (o.callback === cb) {
                result++;
            }
        }
        for(var key of Object.keys(this.childsByProp)) {
            result += this.childsByProp[key].getInstalledCallbackCount(cb);
        }
        return result;
    }

    // Put every newly ready callback into result.
    // Update the minSerial/minChildSerial according
    // return true when something was done
    findReadyCallbacks(content, result) {
        var contentSerial = content === undefined ? undefined : content.serial;
        var contentChildSerial = content === undefined ? undefined : content.childSerial;

        if ((contentSerial === this.minSerial)
            && (contentChildSerial === this.minChildSerial))
        {
            return false;
        }

        var ret = false;

        if (this.callback !== undefined) {
            this.minSerial = contentSerial;
            this.minChildSerial = contentChildSerial;
            if (!this.callback.pending) {
                this.callback.pending = true;
                result.push(this.callback);
            }
            ret = true;
        } else {
            // Direct calls to listeners
            for (var o of this.listeners) {
                var beforeSerial = o.serial;
                var beforeChildSerial = o.childSerial;

                if (o.findReadyCallbacks(content, result)) {
                    ret = true;
                }
            }

            for(var wildcardChild of this.wildcardChilds) {
                // Ensure that all childs exists where template applied
                // FIXME: use serial and childSerial
                for(var o of this.getContentChilds(content)) {
                    // Create triggers that must trigger if key exists
                    if (!Object.prototype.hasOwnProperty.call(wildcardChild.wildcardAppliedToChilds, o)) {
                        wildcardChild.wildcardAppliedToChilds[o] = true;
                        wildcardChild.cloneInto(this.getChild(o), this.getContentChild(content, o), wildcardChild, null);
                    }
                }
            }
            // TODO : Instanciate (drop) wildcards for new items.

            // Calls to childs
            for (var childId of Object.keys(this.childsByProp)) {
                var childContent = this.getContentChild(content, childId);

                var childSynchronizerTrigger = this.childsByProp[childId];
                if (childSynchronizerTrigger.findReadyCallbacks(childContent, result)) {
                    ret = true;
                }

                // Desinstnciate useless wildcards
                // FIXME: do this also if processed (was last !)
                if (childContent === undefined && childSynchronizerTrigger.hasChildFromWildcard) {
                    var replacement = childSynchronizerTrigger.purgeWildcards();
                    if (replacement === undefined) {
                        delete this.childByProp[childId];
                    }
                }
            }


            if (ret) {
                this.updateMins();
            }
        }

        return ret;
    }
}

class JsonProxy {

    newNode(parent, emptyValue) {
        var details = {
            parent : parent,
            value: emptyValue,
            serial: this.currentSerial
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
        this.notifyPending = false;

        var toCall = Object.assign(this.listeners);
        for (var k of Object.keys(toCall)) {
            if (has(toCall, k) && has(this.listeners, k)) {
                toCall[k]();
            }
        }
    }

    // Create a node with emptyValue as storage
    newObjectNode(parent, emptyValue) {
        if ((typeof emptyValue) != 'object') throw new Error("Object node must have object");
        var details = this.newNode(parent, emptyValue);
        this.toObjectNode(details);
        return details;
    }


    // Example: to be called on every change of the connected property in indiManager
    // addSynchronizer({'indiManager':{deviceTree':{$@: {'CONNECTION':{'childs':{'CONNECT':{'$_': true}}}} )
    // forceInitialTriggering
    addSynchronizer(path, callback, forceInitialTrigger) {
        if (this.currentSerialUsed) {
            this.currentSerial++;
            this.currentSerialUsed = false;
        }
        var listener = {
            func: callback,
            pending: false,
            dead: false
        };

        this.synchronizerRoot.addToPath(this.root, listener, path, 0, forceInitialTrigger);

        return listener;
    }



    // Call untils no more synchronizer is available
    flushSynchronizers() {
        do {
            if (this.currentSerialUsed) {
                this.currentSerial++;
                this.currentSerialUsed = false;
            }
            var todoList = [];
            var cb = this.synchronizerRoot.findReadyCallbacks(this.root, todoList);
            if (!todoList.length) {
                return;
            }
            for(var cb of todoList) {
                // FIXME :check callback is not dead
                if (cb.dead) {
                    continue;
                }
                cb.pending = false;
                cb.func();
            }
        } while(true);
    }

    removeSynchronizer(listener) {
        throw new Error("not implemented");
    }

    addListener(listener) {
        var key = "" + this.listenerId++;
        this.listeners[key] = listener;
        return key;
    }

    removeListener(listenerId) {
        delete this.listeners[listenerId];
    }

    toSimpleNode(details) {
        delete details.proxy;
        delete details.childSerial;
    }

    toObjectNode(details)
    {
        var self = this;
        // Create the proxy
        var handler = {
            get: function(target, nom) {
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
            deleteProperty: function(target, nom) {
                if (has(details.value, nom)) {
                    var currentDesc = details.value[nom];
                    self.markDirty(currentDesc);
                }
                delete details.value[nom];
                return true;
            },
            set: function(target, nom, newValue, receiver) {
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
    markDirty(details) {
        this.useCurrentSerial();
        details.serial = this.currentSerial;
        while(details.parent != null) {
            details = details.parent;
            if (details.childSerial == this.currentSerial) return;
            details.childSerial = this.currentSerial;
        }
    }



    mergeValues(from, intoProxy)
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

        this.synchronizerRoot = new SynchronizerTrigger();
    }

    // Store for each node in the path, the serial and the childSerial
    takePathSnapshot(path) {
        var result = [];
        var at = this.root;
        for(var i = 0; i <= path.length; ++i) {
            path.push(at.serial);
            path.push(at.childSerial);

        }
    }

    takeSerialSnapshot()
    {
        var self = this;
        if (this.currentSerialUsed) {
            this.currentSerial++;
            this.currentSerialUsed = false;
        }

        function forObject(desc)
        {
            if (valueHasChild(desc.value)) {
                var result = {
                    serial: desc.serial,
                    childSerial: desc.childSerial,
                    props: {}
                };
                for(var k of Object.keys(desc.value)) {
                    result.props[k] = forObject(desc.value[k]);
                }
                return result;
            } else {
                return desc.serial;
            }
        }
        return forObject(this.root);
    }

    // Update version and returns a list of op
    diff(version) {

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
        function objectProps(objDesc, objVersion) {
            var result;
            var whereToStoreProps;
            // Ignorer objVersion si il n'est pas compatible
            // Pas de changement
            if (objVersion.serial != objDesc.serial) {
                result = {};
                whereToStoreProps = {};
                if (Array.isArray(objDesc.value)) {
                    result.newArray = whereToStoreProps;
                } else {
                    result.newObject = whereToStoreProps;
                }
                // Reset everything in objVersion
                objVersion.serial = objDesc.serial;
                objVersion.childSerial = objDesc.childSerial;
                objVersion.props = {};
            } else {
                if (objVersion.childSerial == objDesc.childSerial) {
                    // Same serials
                    return undefined;
                }
                objVersion.childSerial = objDesc.childSerial;
                result = {};
                whereToStoreProps = {};
                result.update = whereToStoreProps;

                // Find the properties to remove
                var toDelete = [];
                for (var key of Object.keys(objVersion.props)) {
                    if (has(objVersion.props, key)) {
                        if (!has(objDesc.value, key)) {
                            toDelete.push(key);
                        }
                    }
                }

                if (toDelete.length != 0) {
                    for(var i = 0; i < toDelete.length; ++i) {
                        delete objVersion.props[toDelete[i]];
                    }
                    result.delete = toDelete;
                }
            }

            for(var key of Object.keys(objDesc.value)) {
                if (has(objDesc.value, key)) {
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

                        propUpdate = objectProps(propObjDesc, propObjVersion);
                    } else {

                        propUpdate = finalProp(propObjDesc, objVersion, key);
                    }
                    if (propUpdate !== undefined) {
                        whereToStoreProps[key] = propUpdate;
                    }
                }
            }

            return result;
        }

        function finalProp(objDesc, objVersion, key) {
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

        return objectProps(this.root, version);
    }

    getTarget() {
        return this.root.proxy;
    }

    fork() {
        if (this.currentSerialUsed) {
            this.currentSerial++;
            this.currentSerialUsed = false;
        }

        return {
            data: JSON.parse(JSON.stringify(this.root.proxy)),
            serial: this.takeSerialSnapshot()
        }
    }
}

// Update an object
function applyDiff(from, diff) {
    if (diff === undefined) {
        return from;
    }
    if (typeof diff == 'number' || typeof diff == 'string' || diff === null) {
        return diff;
    }
    var updateProps = undefined;
    if (has(diff, 'newArray')) {
        updateProps = diff.newArray;
        from = [];
    } else if (has(diff, 'newObject')) {
        updateProps = diff.newObject;
        from = {};
    } else if (has(diff, 'update')) {
        updateProps = diff.update;
        from = Object.assign({}, from);
        if (has(diff, 'delete')) {
            var toDelete = diff.delete;
            for(var i = 0; i < toDelete.length; ++i) {
                delete from[toDelete[i]];
            }
        }
    }

    if (updateProps != undefined) {
        for(var k of Object.keys(updateProps)) {
            if (has(updateProps, k)) {
                from[k] = applyDiff(has(from, k) ? from[k] : undefined, updateProps[k]);
            }
        }
    }

    return from;
}


module.exports = {JsonProxy, applyDiff, has};