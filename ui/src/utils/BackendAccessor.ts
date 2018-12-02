import * as Promises from '../shared/Promises';
import * as JsonPath from '../shared/JsonPath';
import JsonProxy from '../shared/JsonProxy';


function asSubPath(path:string) {
    if (path.substr(0,1) === "$") {
        path = path.substr(1);
    } else if (path.substr(0,1) !== ".") {
        path = "." + path
    }
    return path;
}

class BackendChildAccessor {
    readonly root: BackendAccessor;
    readonly relpath: string; // startwith .

    constructor(root: BackendAccessor, relpath: string)
    {
        this.root = root;
        this.relpath = relpath;
    }

    apply(jsonDiff:any) {
        const path = JsonPath.asDirectPath('$' + this.relpath);
        
        for(let i = path.length - 1; i >= 0; --i) {
            
            jsonDiff =  {update: {[path[i]]: jsonDiff}};
        }
        console.log('Root apply:', jsonDiff);
        return this.root.apply(jsonDiff);
    }

    send = (value:any)=>{
        return this.apply(JsonProxy.asDiff(value));
    }

    child(path:string) {
        return new BackendChildAccessor(this.root, this.relpath + asSubPath(path));
    }

    fromStore(store:any, defaultValue?:any)
    {
        let root = this.root.fromStore(store);
        if (root === undefined) return defaultValue;
        let rslt = JsonPath.atPath(root, '$' + asSubPath(this.relpath));
        if (rslt === undefined) return defaultValue;
        return rslt;
    }
}

class BackendAccessor {
    backendPath: string;
    constructor(backendPath:string)
    {
        this.backendPath = backendPath;
    }

    // Returns a promise that perform a change.
    // A change is a set of jsonPath=>operation
    // Changes has: path, value, delete
    apply(changes:any) {
        return new Promises.Immediate(()=>{
            throw new Error("not implemented");
        });
    }

    child(path:string) {
        return new BackendChildAccessor(this, asSubPath(path));
    }

    readonly send= (value:any)=>{
        return this.apply(JsonProxy.asDiff(value));
    }

    // Map the path to the given target
    fromStore(store:any, defaultValue?:any)
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