
// Return the node of an object at the given path
function atPath(obj, path) {
    var start = obj;
    var result = obj;

    for(var i = 0; i < path.length; ++i) {
        // Don't search for childs in final value
        if (result === undefined || result === null || !((typeof result) == "object")) {
            return undefined;
        }
        var item = path[i];
        if (!Object.prototype.hasOwnProperty.call(result, item)) {
            // prop not found
            return undefined;
        }
        result = result[item];
    }

    return result;
}

export {atPath}
