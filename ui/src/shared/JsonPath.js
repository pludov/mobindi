import jp from 'jsonpath';


// Returns the object if exactly one match
// throws an error if more than one match
// return undefined if none found.
// Accept undefined as object (will return undefined)
function atPath(object, path)
{
    if (object === undefined) {
        return undefined;
    }
    var rslt = jp.query(object, path, 2);
    switch(rslt.length) {
        case 0:
            return undefined;
        case 1:
            return rslt[0];
        default:
            throw new Error("More than one match in atPath");
    }
}

export {atPath}