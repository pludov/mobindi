import * as Store from "../Store";
import {AccessPath, For} from "../shared/AccessPath";
import { RecursiveStoreAccessor } from "./StoreAccessor";
import JsonProxy, { Diff} from "../shared/JsonProxy";


/**
 * A recursive accessor that send a patch to the redux store
 * implementation must override apply & fromStore
 */
export default class StorePatchAccessor<Root, Target=Root> implements RecursiveStoreAccessor<Target> {
    readonly root: StorePatchAccessor<Root>;
    readonly relpath: AccessPath<Root, Target>; // startwith .

    constructor()
    constructor(root: StorePatchAccessor<Root>)
    constructor(root: StorePatchAccessor<Root>, path: AccessPath<Root, Target>)
    constructor(root?: StorePatchAccessor<Root>, path?: AccessPath<Root, Target>)
    {
        this.root = root || (this as any);
        this.relpath = path as any|| For((e:Root)=>(e));
    }

    protected async apply(jsonDiff:any) {
        for(let i = this.relpath.path.length - 1; i >= 0; --i) {
            jsonDiff =  {update: {[this.relpath.path[i]]: jsonDiff}};
        }

        await this.root.apply(jsonDiff);
    }

    send = async (value:any)=>{
        if (value === undefined) {
            let jsonDiff : Diff = {update: {}, delete: [this.relpath.path.slice(-1)[0]]};
            for(let i = this.relpath.path.length - 2; i >= 0; --i) {
                jsonDiff = {update: {[this.relpath.path[i]]: jsonDiff}};
            }
            return this.root.apply(jsonDiff);
        } else {
            return this.apply(JsonProxy.asDiff(value));
        }
    }

    child<NewTarget>(path:AccessPath<Target, NewTarget>): RecursiveStoreAccessor<NewTarget> {
        return new StorePatchAccessor(this.root, this.relpath.join(path));
    }

    prop<Prop extends keyof Target & string>(s: Prop) : RecursiveStoreAccessor<Target[Prop]> {
        return new StorePatchAccessor(this.root, this.relpath.prop(s));
    }

    fromStore(store:Store.Content, defaultValue?:any)
    {
        const root = this.root.fromStore(store);
        if (root === undefined) return defaultValue;

        let rslt = this.relpath.access(root);
        if (rslt === undefined) return defaultValue;
        return rslt;
    }
};
