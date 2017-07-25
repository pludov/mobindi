const update = require('immutability-helper');

function hasKey(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
}

function isObject(item) {
    return (item != null && typeof item === 'object' && !Array.isArray(item));
}

function mergeDeep(target, source) {
    let output = Object.assign({}, target);
    if (isObject(target) && isObject(source)) {
        Object.keys(source).forEach(key => {
            if (isObject(source[key])) {
                if (!hasKey(target, key))
                    Object.assign(output, { [key]: source[key] });
                else
                    output[key] = mergeDeep(target[key], source[key]);
            } else {
                Object.assign(output, { [key]: source[key] });
            }
        });
    }
    return output;
}

update.extend('$mergedeep', function(value, object) {
    return mergeDeep(object, value);
});

module.exports = { hasKey, mergeDeep, update };