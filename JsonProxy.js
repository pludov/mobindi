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
 * Represent an object
 *
 * Every object for which a property is changed is marked as changed.
 * Changes for object and arrays are note
 *
 * Every time a property change (add/remove/value changed), the serial of the object is incremented on it node and all its parent
 *
 * Suppose
 *      {
 *              .status { serial:CHANGED}
 *              child1: {
 *                  .status { serial: CHANGED}
 *                  a:
 *                  b:
 *                  c:
 *              },
 *              child2: {
 *              },
 *              array4: {
 *                  .status { serial: NOT_CHANGED }
 *              }
 *              text: "coucou"
 *
 *      }
 * The patch generated will be:
 *      {
 *          $missings: [child2, array4],
 *          child1: {
 *              $missings: []
 *              a:
 *              b:
 *              c:
 *          },
 *          text: "coucou"
 *      }
 */
class JsonProxy {
    newProxiedObject(parent, empty)
    {
        var details = {
            parent: parent,
            storage: empty,
            serial: 0,
            // Limit the increse (and propagation) to one between each "takeSerialSnapshot()"
            dirtySerial: false,
            // keep parent's serial at creation time (parent is always dirty here)
            parentSerial: this.root != undefined ? this.root.serial + 1 : 0
        };

        details.proxy = new Proxy(details.storage, this.handler);

        this.proxyToOriginal.set(details.proxy, details);
        return details;
    }

    dettach(proxy)
    {
        if (typeof proxy == 'object') {

            var desc = this.proxyToOriginal.get(object);
            this.proxyToOriginal.get(object);
            for (var k in desc) {
                this.dettach(desc[k]);
            }
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

    markDirty(at)
    {
        do {
            if (at.dirtySerial) {
                return;
            }
            at.dirtySerial = true;
            at = at.parent;
        } while(at != null);
    }

    constructor() {
        var self = this;

        this.proxyToOriginal = new WeakMap();


        this.handler = {
            // FIXME: delete

            set: function(target, nom, newValue, receiver) {
                console.log('set called with target=' + objectId(target) + ' receiver=' + objectId(receiver));
                // Value is set
                if (newValue == undefined) {
                    throw new Error("undefined not supported in JSON");
                }

                var currentValue = target[nom];
                if (currentValue === newValue) {
                    return true;
                }

                var parentDesc = self.proxyToOriginal.get(receiver);

                // Si c'est un proxy (déplacement), on le déttache
                if (typeof newValue == "object") {
                    if (self.proxyToOriginal.has(newValue)) {
                        newValue = self.proxyToOriginal.get(newValue).storage;
                    }

                    // Forget incompatible values
                    if (currentValue != undefined && (typeof currentValue) != (typeof newValue)) {
                        self.dettach(currentValue);
                        currentValue = undefined;
                    }

                    // Create a new value if required
                    if (currentValue == undefined) {
                        var childDesc = self.newProxiedObject(parentDesc, Array.isArray(newValue) ? [] : {});
                        var newProxy = childDesc.proxy;
                        target[nom] = newProxy;
                        currentValue = newProxy;
                        self.markDirty(childDesc);
                    }

                    self.mergeValues(newValue, currentValue);
                } else {
                    // On positionne juste une propriété finale
                    if (typeof currentValue == 'object') {
                        self.dettach(currentValue);
                    } else if (currentValue == newValue) {
                        // Cas trivial
                        return true;
                    }
                    target[nom] = newValue;
                    self.markDirty(parentDesc);
                }

                return true;
            }
        };

        this.root = this.newProxiedObject(null, {});
    }

    getTarget() {
        return this.root.proxy;
    }

    takeSerialSnapshot()
    {
        var self = this;

        function forObject(o)
        {
            var result = {};
            var desc = self.proxyToOriginal.get(o);

            if (desc.dirtySerial) {
                desc.serial++;
                desc.dirtySerial = false;
            }

            result[serialProperty] = desc.serial;
            result[createdProperty] = desc.parentSerial;
            for(var k in o) {
                var value = o[k];
                if (typeof value == 'object') {
                    result[k] = forObject(value);
                }
            }
            return result;
        }
        return forObject(this.root.proxy);
    }

}



module.exports = {JsonProxy};