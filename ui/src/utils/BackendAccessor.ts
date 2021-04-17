import JsonProxy from '../shared/JsonProxy';
import * as Store from "../Store"
import {Accessor} from "./Accessor"
import { BackofficeStatus } from '@bo/BackOfficeStatus';


export interface BackendAccessor<TYPE> {
    child<NewTarget>(path:Accessor<TYPE, NewTarget>): BackendAccessor<NewTarget>;
    send: (value:any)=>Promise<void>;
    fromStore: (s:Store.Content)=>TYPE;
};

class BackendChildAccessor<Root, Target> {
    readonly root: BackendAccessorImpl<Root>;
    readonly relpath: Accessor<Root, Target>; // startwith .

    constructor(root: BackendAccessorImpl<Root>, path: Accessor<Root, Target>)
    {
        this.root = root;
        this.relpath = path;
    }

    apply(jsonDiff:any) {
        for(let i = this.relpath.path.length - 1; i >= 0; --i) {
            jsonDiff =  {update: {[this.relpath.path[i]]: jsonDiff}};
        }

        return this.root.apply(jsonDiff);
    }

    send = (value:any)=>{
        return this.apply(JsonProxy.asDiff(value));
    }

    child<NewTarget>(path:Accessor<Target, NewTarget>) {
        return new BackendChildAccessor(this.root, this.relpath.join(path));
    }

    fromStore(store:Store.Content, defaultValue?:any)
    {
        const backend = store.backend;
        if (backend === null || backend === undefined) {
            return defaultValue;
        }

        const root = this.root.path.access(backend);
        if (root === undefined) return defaultValue;

        let rslt = this.relpath.access(root);
        if (rslt === undefined) return defaultValue;
        return rslt;
    }
}

class BackendAccessorImpl<TYPE> implements BackendAccessor<TYPE> {
    path: Accessor<Partial<BackofficeStatus>, TYPE>

    constructor(path: Accessor<Partial<BackofficeStatus>, TYPE>)
    {
        this.path = path;
    }

    // Returns a promise that perform a change.
    // A change is a set of jsonPath=>operation
    // Changes has: path, value, delete
    public apply = async(changes:any):Promise<void>=>{
        throw new Error("not implemented");
    }

    child<SUBTYPE>(path:Accessor<TYPE, SUBTYPE>): BackendAccessor<SUBTYPE> {
        return new BackendChildAccessor(this, path);
    }

    readonly send= (value:any)=>{
        return this.apply(JsonProxy.asDiff(value));
    }

    // Map the path to the given target
    fromStore(store:Store.Content, defaultValue?:any)
    {
        const backend = store.backend;
        if (backend === null || backend === undefined) {
            return defaultValue;
        }

        const result = this.path.access(backend);
        if (result !== undefined) return result;
        return defaultValue;
    }
}

export default BackendAccessorImpl;