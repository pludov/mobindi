const update = require('immutability-helper');

function hasKey(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
}

function isObject(item) {
    return (item !== null && item !== undefined && typeof item === 'object' && !Array.isArray(item));
}

function mergeDeep(target, source) {
    var output = target;
    var forked = false;
    if (isObject(target) && isObject(source)) {
        Object.keys(source).forEach(key => {
            var sourceValue = source[key];
            if (isObject(sourceValue)) {
                if (!hasKey(target, key)) {
                    if (!forked) {
                        forked = true;
                        output = Object.assign({}, output);
                    }
                    output[key] = deepCopy(sourceValue);

                } else {
                    var oldValue = target[key];
                    var newValue = mergeDeep(oldValue, sourceValue);
                    if (oldValue !== newValue) {
                        if (!forked) {
                            forked = true;
                            output = Object.assign({}, output);
                        }
                        output[key] = newValue;
                    }
                }
            } else {
                var oldValue = target[key];
                var newValue = deepCopy(sourceValue);
                if (oldValue !== newValue) {
                    if (!forked) {
                        forked = true;
                        output = Object.assign({}, output);
                    }
                    output[key] = newValue;
                }
            }
        });
    } else {
        // Don't merge array
        output = deepCopy(source);
    }
    return output;
}

function deepCopy(object)
{
    if (isObject(object)) {
        var result = {};
        for(var k in object) {
            result[k] = deepCopy(object[k]);
        }
        return result;
    } else if (Array.isArray(object)) {
        var result = [];
        for(var i = 0; i < object.length; ++i) {
            result[i] = deepCopy(object[i]);
        }
        return result;
    } else {
        return object;
    }
}

function deepEqual(o1, o2)
{
    if (o1 === o2) return true;
    var o1obj = isObject(o1);
    if (o1obj != isObject(o2)) {
        return false;
    }
    if (o1obj) {
        // Two objects
        for(var k of Object.keys(o1))
        {
            if (!Object.prototype.hasOwnProperty.call(o2, k)) {
                return false;
            }
            if (!deepEqual(o1[k], o2[k])) return false;
        }
        for(var k of Object.keys(o2)) {
            if (!Object.prototype.hasOwnProperty.call(o1, k)) {
                return false;
            }
        }
        return true;
    } else if (Array.isArray(o1) && Array.isArray(o2)) {
        if (o1.length != o2.length) return false;
        for(var i = 0; i < o1.length; ++i) {
            if (!deepEqual(o1[i], o2[i])) {
                return false;
            }
        }
        return true;
    } else {
        // o1 !== o2 (first line)
        return false;
    }
}

update.extend('$mergedeep', function(value, object) {
    return mergeDeep(object, value);
});

module.exports = { hasKey, mergeDeep, update, deepCopy, deepEqual, isObject };