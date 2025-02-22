
const Wildcard = Symbol("*");

class PropertyResolver {
    parent: PropertyResolver| null;
    propId: string|null;
    neighboors : WeakMap<any, PropertyResolver>;

    constructor(parent: PropertyResolver|null, propId: string|null)
    {
        this.parent = parent;
        this.propId = propId;
        this.neighboors = parent !== null ? parent.neighboors : new WeakMap();
    }

    getPathFromPR(pv : PropertyResolver) : Array<string|null>
    {
        if (pv === this) {
            return [];
        }
        if (this.parent === null) {
            throw new Error("Result is not in tree");
        }
        const ret = this.parent.getPathFromPR(pv);
        ret.push(this.propId);
        return ret;
    }

    getPathTo(a: any) : Array<string|null>
    {
        const pv = this.neighboors.get(a);
        if (pv === undefined) {
            throw new Error("Result is not in tree");
        }
        return pv.getPathFromPR(this);

    }

    getProxy(): any {
        const ret = new Proxy({}, this);
        this.neighboors.set(ret, this);
        return ret;
    }

    getPrototypeOf=()=>{
        throw new Error("Not implemented");
    }

    setPrototypeOf=()=>{
        throw new Error("Not implemented");
    }

    isExtensible=()=>{
        throw new Error("Not implemented");
    }

    preventExtension=()=>{
        throw new Error("Not implemented");
    }

    getOwnPropertyDescriptor=()=>{
        throw new Error("Not implemented");
    }

    defineProperty=()=>{
        throw new Error("Not implemented");
    }

    has = ()=> {
        throw new Error("Not implemented");
    }

    set = ()=> {
        throw new Error("Not implemented");
    }

    deleteOwnProperty = ()=> {
        throw new Error("Not implemented");
    }

    ownKeys = ()=>{
        throw new Error("Not implemented");
    }

    construct = ()=>{
        throw new Error("Not implemented");
    }

    apply = ()=>{
        throw new Error("Not implemented");
    }

    get = (target:any, property:any)=>{
        if (property === Wildcard) {
            property = null;
        }
        if (property instanceof Symbol) {
            throw new Error("Not supported");
        }
        if (typeof property === "number") {
            property = "" + property;
        }
        const child = new PropertyResolver(this, property);
        return child.getProxy();
    }
}

export interface AccessPath<Root,Target> {
    readonly path: Array<string>;
    access(t:Root):Target|undefined;

    prop<Prop extends keyof Target & (string)>(prop:Prop):AccessPath<Root, Target[Prop]>;
    join<NewTarget>(e: AccessPath<Target, NewTarget>):AccessPath<Root, NewTarget>;
    child<NewTarget>(access:(r: Target)=>NewTarget):AccessPath<Root, NewTarget>;
}

export interface WildcardAccessPath<Root, Target> {
    readonly path: Array<string|null>;
    access(t:Root):Target|undefined;
    prop<Prop extends keyof Target & (string)>(prop:Prop):WildcardAccessPath<Root, Target[Prop]>;
    join<NewTarget>(e: WildcardAccessPath<Target, NewTarget>):WildcardAccessPath<Root, NewTarget>;
    child<NewTarget>(access:(r: Target)=>NewTarget):WildcardAccessPath<Root, NewTarget>;
}

class AccessorImpl<Root, Target> {
    readonly path: Array<string|null>;

    constructor(path: Array<string|null>) {
        this.path = path;
    }

    access(t: Root, wildcard?:string[]): Target | undefined
    {
        let v : any = t;
        let wid = 0;
        for(let t of this.path) {
            if (typeof v !== "object") {
                return undefined;
            }
            if (t === null) {
                if ((wildcard === undefined) || (wid >= wildcard.length)) {
                    throw new Error("missing wildcard");
                }
                t = wildcard[wid++];
            }

            if (!Object.prototype.hasOwnProperty.call(v, t)) {
                return undefined;
            }
            v = v[t];
        }

        return v;
    }

    join<NewTarget>(e: WildcardAccessPath<Target, NewTarget>):WildcardAccessPath<Root, NewTarget> {
        return new AccessorImpl<Root, NewTarget>([...this.path, ...e.path]);
    }

    prop<Prop extends keyof Target & (string)>(prop:Prop):WildcardAccessPath<Root, Target[Prop]> {
        return new AccessorImpl<Root, Target[Prop]>([...this.path, prop]);
    }

    child<NewTarget>(access:(r: Target)=>NewTarget):WildcardAccessPath<Root, NewTarget> {
        const root = new PropertyResolver(null, "<root>");
        const target = access(root.getProxy() as any as Target);

        const path = root.getPathTo(target);

        return new AccessorImpl<Root, NewTarget>([...this.path, ...path]);
    }
}

/**
 * access is used only for gathering paths. It is not used for direct access.
 * It is allowed to assume every property is set, missing access will be catched
 */
export function For<Root,Target>(access: (r:Root)=>Target): AccessPath<Root,Target> {
    const root = new PropertyResolver(null, "<root>");
    const target = access(root.getProxy() as any as Root);

    const path = root.getPathTo(target);

    return new AccessorImpl<Root, Target>(path) as AccessPath<Root, Target>;
}

export function ForWildcard<Root, Target>(access: (r:Root, ids: string[])=>Target ): WildcardAccessPath<Root, Target> {
    const root = new PropertyResolver(null, "<root>");

    const ids = [Wildcard, Wildcard, Wildcard, Wildcard, Wildcard, Wildcard, Wildcard, Wildcard, Wildcard, Wildcard, Wildcard, Wildcard, Wildcard ] as any as string[];
    const target = access(root.getProxy() as any as Root, ids);

    const path = root.getPathTo(target);

    return new AccessorImpl<Root, Target>(path);
}
