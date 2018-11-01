import * as Promises from '../shared/Promises';
import * as JsonPath from '../shared/JsonPath';
import JsonProxy from '../shared/JsonProxy';


function asSubPath(path) {
    if (path.substr(0,1) == "$") {
        path = path.substr(1);
    } else {
        path = "." + path
    }
    return path;
}

class BackendChildAccessor {
    constructor(root, relpath)
    {
        this.root = root;
        this.relpath = relpath;
        this.send = this.send.bind(this);
    }

    apply(jsonDiff) {
        const path = JsonPath.asDirectPath('$' + this.relpath);
        
        for(let i = path.length - 1; i >= 0; --i) {
            
            jsonDiff =  {update: {[path[i]]: jsonDiff}};
        }
        console.log('Root apply:', jsonDiff);
        return this.root.apply(jsonDiff);
    }

    send(value) {
        return this.apply(JsonProxy.asDiff(value));
    }

    child(path) {
        return new BackendChildAccessor(this.root, this.relpath + asSubPath(path));
    }

    fromStore(store, defaultValue)
    {
        let root = this.root.fromStore(store);
        if (root === undefined) return defaultValue;
        let rslt = JsonPath.atPath(root, '$' + asSubPath(this.relpath));
        if (rslt === undefined) return defaultValue;
        return rslt;
    }
}

class BackendAccessor {

    constructor(backendPath)
    {
        this.backendPath = backendPath;
        this.send = this.send.bind(this);
    }

    // Returns a promise that perform a change.
    // A change is a set of jsonPath=>operation
    // Changes has: path, value, delete
    apply(changes) {
        return new Promises.Immediate(()=>{
            throw new Error("not implemented");
        });
    }

    child(path) {
        return new BackendChildAccessor(this, asSubPath(path));
    }

    send(value) {
        return this.apply(JsonProxy.asDiff(value));
    }

    // Map the path to the given target
    fromStore(store, defaultValue)
    {
        const backend = store.backend;
        if (backend === null || backend === undefined) {
            return defaultValue;
        }
        const result = JsonPath.atPath(backend, this.backendPath);
        if (result !== undefined) return result;
        return defaultValue;
    }
}

export default BackendAccessor;