import * as Promises from '../shared/Promises';
import * as JsonPath from '../shared/JsonPath';
import JsonProxy from '../shared/JsonProxy';
import * as Store from "../Store"


function asSubPath(path:string) {
    if (path.substr(0,1) === "$") {
        path = path.substr(1);
    } else if (path.substr(0,1) !== ".") {
        path = "." + path
    }
    return path;
}

export interface BackendAccessor<TYPE> {
    child<PATH extends keyof TYPE & string>(path:PATH): BackendAccessor<TYPE[PATH]>;
    send: (value:any)=>Promise<void>;
    fromStore: (s:Store.Content)=>TYPE;
};

class BackendChildAccessor {
    readonly root: BackendAccessorImpl<any>;
    readonly relpath: string; // startwith .

    constructor(root: BackendAccessorImpl<any>, relpath: string)
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

    fromStore(store:Store.Content, defaultValue?:any)
    {
        let root = this.root.fromStore(store);
        if (root === undefined) return defaultValue;
        let rslt = JsonPath.atPath(root, '$' + asSubPath(this.relpath));
        if (rslt === undefined) return defaultValue;
        return rslt;
    }
}

class BackendAccessorImpl<TYPE> implements BackendAccessor<TYPE> {
    backendPath: string;
    constructor(backendPath:string)
    {
        this.backendPath = backendPath;
    }

    // Returns a promise that perform a change.
    // A change is a set of jsonPath=>operation
    // Changes has: path, value, delete
    public apply = async(changes:any):Promise<void>=>{
        throw new Error("not implemented");
    }

    child<PATH extends keyof TYPE & string>(path:PATH): BackendAccessor<TYPE[PATH]> {
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

export default BackendAccessorImpl;