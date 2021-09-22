import JsonProxy from '../shared/JsonProxy';
import * as Store from "../Store"
import {AccessPath, For} from "../shared/AccessPath"
import { BackofficeStatus } from '@bo/BackOfficeStatus';


export interface BackendAccessor<TYPE> extends Store.Accessor<TYPE>{
    getPath:()=>string[];
}

export interface RecursiveBackendAccessor<TYPE> extends BackendAccessor<TYPE>, Store.RecursiveAccessor<TYPE> {
    child<NewTarget>(path:AccessPath<TYPE, NewTarget>): RecursiveBackendAccessor<NewTarget>;
    prop<Prop extends keyof TYPE & string>(prop:Prop): RecursiveBackendAccessor<TYPE[Prop]>;
};

class BackendChildAccessor<Root, Target> {
    readonly root: BackendAccessorImpl<Root>;
    readonly relpath: AccessPath<Root, Target>; // startwith .

    constructor(root: BackendAccessorImpl<Root>, path: AccessPath<Root, Target>)
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

    child<NewTarget>(path:AccessPath<Target, NewTarget>): RecursiveBackendAccessor<NewTarget> {
        return new BackendChildAccessor(this.root, this.relpath.join(path));
    }
    
    prop<Prop extends keyof Target & string>(s: Prop) : RecursiveBackendAccessor<Target[Prop]> {
        return new BackendChildAccessor(this.root, this.relpath.prop(s));
    }

    getPath = ()=> {
        return [...this.root.getPath(), ...this.relpath.path];
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

export class BackendAccessorImpl<TYPE> implements RecursiveBackendAccessor<TYPE> {
    path: AccessPath<Partial<BackofficeStatus>, TYPE>

    constructor(path: AccessPath<Partial<BackofficeStatus>, TYPE>)
    {
        this.path = path;
    }

    // Returns a promise that perform a change.
    // A change is a set of jsonPath=>operation
    // Changes has: path, value, delete
    public apply = async(changes:any):Promise<void>=>{
        throw new Error("not implemented");
    }

    child<SUBTYPE>(path:AccessPath<TYPE, SUBTYPE>): RecursiveBackendAccessor<SUBTYPE> {
        return new BackendChildAccessor(this, path);
    }

    prop<Prop extends keyof TYPE & string>(s: Prop) : RecursiveBackendAccessor<TYPE[Prop]> {
        return new BackendChildAccessor(this, For((e:TYPE)=>e)).prop(s);
    }

    readonly send= (value:any)=>{
        return this.apply(JsonProxy.asDiff(value));
    }

    getPath = ()=>{
        return this.path.path;
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
