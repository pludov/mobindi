import * as Store from "../Store";
import {AccessPath, For} from "../shared/AccessPath";



export interface RecursiveStoreAccessor<TYPE> extends Store.Accessor<TYPE>, Store.RecursiveAccessor<TYPE> {
    child<NewTarget>(path:AccessPath<TYPE, NewTarget>): RecursiveStoreAccessor<NewTarget>;
    prop<Prop extends keyof TYPE & string>(prop:Prop): RecursiveStoreAccessor<TYPE[Prop]>;
};

function swallowClone(e:any) {
    if (typeof e === "object") {
        if (Array.isArray(e)) {
            return e.slice();
        }
        return {...e};
    }
    return e;
}

/** An recursive accessor that send a copy of the store */
export default class StoreAccessor<Root, Target=Root> implements RecursiveStoreAccessor<Target> {
    readonly root: Store.Accessor<Root>;
    readonly relpath: AccessPath<Root, Target>; // startwith .

    constructor(root: Store.Accessor<Root>)
    constructor(root: Store.Accessor<Root>, path: AccessPath<Root, Target>)
    constructor(root: Store.Accessor<Root>, path?: AccessPath<Root, Target>)
    {
        this.root = root;
        this.relpath = path as any|| For((e:Root)=>(e));
    }

    send = (v:any)=>{

        const rootAccessor: StoreAccessor<Root, Root> = new StoreAccessor(this.root, For((e)=>e));

        const store = Store.getStore().getState();
        const value = {...rootAccessor.fromStore(store)};
        let current:any = value;
        let currentAccessor: any = rootAccessor;

        for(let i =0; i <= this.relpath.path.length - 1; ++i) {
            const k = this.relpath.path[i];
            currentAccessor = currentAccessor.child(For((e:any)=>e[k]));

            // Clone the object.
            current[k] = (i === this.relpath.path.length - 1 ? v :
                        swallowClone(currentAccessor.fromStore(store)));
            current = current[k];
        }
        return this.root.send(value as Root);
    }

    child<NewTarget>(path:AccessPath<Target, NewTarget>): RecursiveStoreAccessor<NewTarget> {
        return new StoreAccessor(this.root, this.relpath.join(path));
    }

    prop<Prop extends keyof Target & string>(s: Prop) : RecursiveStoreAccessor<Target[Prop]> {
        return new StoreAccessor(this.root, this.relpath.prop(s));
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
