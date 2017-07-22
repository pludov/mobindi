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


/**
 * Represent a versioned JSON like object tree
 *
 * store for each property:
 *   * serial number
 *     * For final type (string, number, null) node the last "time" of assignment
 *     * For object/array, the time of creation of the object
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

class JsonProxy {

    newNode(parent, emptyValue) {
        var details = {
            parent : parent,
            value: emptyValue,
            serial: this.currentSerial
        };
        this.currentSerialUsed = true;
        this.markDirty(details);
        return details;
    }

    // Create a node with emptyValue as storage
    newObjectNode(parent, emptyValue) {
        if ((typeof emptyValue) != 'object') throw new Error("Object node must have object");
        var details = this.newNode(parent, emptyValue);
        this.toObjectNode(details);
        return details;
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
                if (Object.prototype.hasOwnProperty.call(details.value, nom)) {
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
            delete: function(target, nom) {
                if (Object.prototype.hasOwnProperty.call(details.value, nom)) {
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
                if (newValue == undefined) {
                    throw new Error("undefined not supported in JSON");
                }

                var currentDesc = Object.prototype.hasOwnProperty.call(details.value, nom) ? details.value[nom] : undefined;

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
        this.currentSerialUsed = true;

        return details;
    }

    // Mark the value of a node "dirty"
    markDirty(details) {
        this.currentSerialUsed = true;
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
            for(var k in from) {
                intoProxy[k] = from[k];
            }
            for(var k in intoProxy) {
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
        this.root = this.newObjectNode(null, {})
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
                for(var k in desc.value) {
                    result.props[k] = forObject(desc.value[k]);
                }
                return result;
            } else {
                return desc.serial;
            }
        }
        return forObject(this.root);
    }

    getTarget() {
        return this.root.proxy;
    }
}



module.exports = {JsonProxy};