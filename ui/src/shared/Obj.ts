import update from 'immutability-helper';

function hasKey(obj:object, key:string) {
    return Object.prototype.hasOwnProperty.call(obj, key);
}

function isObject(item:any) {
    return (item !== null && item !== undefined && typeof item === 'object' && !Array.isArray(item));
}

function mergeDeep(target : any, source: any) {
    let output = target;
    let forked = false;
    if (isObject(target) && isObject(source)) {
        Object.keys(source).forEach(key => {
            const sourceValue = source[key];
            if (isObject(sourceValue)) {
                if (!hasKey(target, key)) {
                    if (!forked) {
                        forked = true;
                        output = Object.assign({}, output);
                    }
                    output[key] = deepCopy(sourceValue);

                } else {
                    const oldValue = target[key];
                    const newValue = mergeDeep(oldValue, sourceValue);
                    if (oldValue !== newValue) {
                        if (!forked) {
                            forked = true;
                            output = Object.assign({}, output);
                        }
                        output[key] = newValue;
                    }
                }
            } else {
                const oldValue = target[key];
                const newValue = deepCopy(sourceValue);
                if (oldValue !== newValue) {
                    if (!forked) {
                        forked = true;
                        output = Object.assign({}, output);
                    }
                    output[key] = newValue;
                }
            }
        });
    } else {
        // Don't merge array
        output = deepCopy(source);
    }
    return output;
}

function deepCopy<T>(object:T):T
{
    if (isObject(object)) {
        const result : any = {};
        for(const k of Object.keys(object as Object)) {
            result[k] = deepCopy((object as any)[k]);
        }
        return result;
    } else if (Array.isArray(object)) {
        const result:any = [];
        for(let i = 0; i < object.length; ++i) {
            result[i] = deepCopy(object[i]);
        }
        return result;
    } else {
        return object;
    }
}

function deepEqual(o1:any, o2:any)
{
    if (o1 === o2) {
        return true;
    }
    const o1obj = isObject(o1);
    if (o1obj !== isObject(o2)) {
        return false;
    }
    if (o1obj) {
        // Two objects
        for(const k of Object.keys(o1))
        {
            if (!Object.prototype.hasOwnProperty.call(o2, k)) {
                return false;
            }
            if (!deepEqual(o1[k], o2[k])) {
                return false;
            }
        }
        for(const k of Object.keys(o2)) {
            if (!Object.prototype.hasOwnProperty.call(o1, k)) {
                return false;
            }
        }
        return true;
    } else if (Array.isArray(o1) && Array.isArray(o2)) {
        if (o1.length !== o2.length) {
            return false;
        }
        for(let i = 0; i < o1.length; ++i) {
            if (!deepEqual(o1[i], o2[i])) {
                return false;
            }
        }
        return true;
    } else {
        // o1 !== o2 (first line)
        return false;
    }
}

update.extend('$mergedeep', (value, object) => {
    return mergeDeep(object, value);
});

export function getOwnProp<T>(o: {[id: string]: T}, s: string):T|undefined;
export function getOwnProp<T>(o: {[id: string]: T}|undefined|null, s: string):T|undefined;
export function getOwnProp<T>(o: {[id: string]: T}, s: undefined|null):undefined;
export function getOwnProp<T>(o: {[id: string]: T}|undefined|null, s: string|undefined|null):T|undefined;
export function getOwnProp<T>(o: undefined|null, s: any):undefined;

export function getOwnProp(o: any, s: any) {
    if (s === null || s === undefined) {
        return undefined;
    }
    if (hasKey(o, s)) {
        return o![s];
    }
    return undefined;
}

function noUndef<T extends Object> (obj: T): T {
    for(const k of Object.keys(obj)) {
        if ((obj as any)[k] === undefined) {
            delete (obj as any)[k];
        }
    }
    return obj;
}


export function getOrCreateOwnProp<T>(obj: {[id:string]:T}, key: string, create?: ()=>T): T {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) {
        obj[key] = create ? create() : {} as T;
    }
    return obj[key];
}

export function get3D<T>(obj: {[id:string]:{[id:string]:{[id:string]: T}}}, a: string, b: string, c: string): T|undefined {
    const objA = getOwnProp(obj, a);
    if (!objA) {
        return undefined;
    }
    const objB = getOwnProp(objA, b);
    if (!objB) {
        return undefined;
    }
    return getOwnProp(objB, c);
}

export function add3D<T>(obj: {[id:string]:{[id:string]:{[id:string]: T}}}, a: string, b: string, c: string, value: T): boolean {
    const objA = getOrCreateOwnProp(obj, a);
    const objB = getOrCreateOwnProp(objA, b);
    if (Object.prototype.hasOwnProperty.call(objB, c)) {
        return false;
    }
    objB[c] = value;
    return true;
}

export function set3D<T>(obj: {[id:string]:{[id:string]:{[id:string]: T}}}, a: string, b: string, c: string, value: T) {
    const objA = getOrCreateOwnProp(obj, a);
    const objB = getOrCreateOwnProp(objA, b);
    objB[c] = value;
}

export function delete3D<T>(obj: {[id:string]:{[id:string]:{[id:string]: T}}}): boolean;
export function delete3D<T>(obj: {[id:string]:{[id:string]:{[id:string]: T}}}, a: string): boolean;
export function delete3D<T>(obj: {[id:string]:{[id:string]:{[id:string]: T}}}, a: string, b: string): boolean;
export function delete3D<T>(obj: {[id:string]:{[id:string]:{[id:string]: T}}}, a: string, b: string, c: string): boolean;
export function delete3D<T>(obj: {[id:string]:{[id:string]:{[id:string]: T}}}, a?: string, b?: string, c?: string) {
    if (a === undefined) {
        for(const k of Object.keys(obj)) {
            delete obj[k];
        }
        return;
    }
    const objA = getOwnProp(obj, a);
    if (!objA) {
        return false;
    }
    if (b !== undefined) {
        const objB = getOwnProp(objA, b);
        if (!objB) {
            return false;
        }
        if (c !== undefined) {
            if (!Object.prototype.hasOwnProperty.call(objB, c)) {
                return false;
            }
            delete(objB[c]);
            if (Object.keys(objB).length !== 0) {
                return true;
            }
        }
        delete objA[b];
        if (Object.keys(objA).length !== 0) {
            return true;
        }
    }
    delete obj[a];
    return true;
}

export function count3D<T>(obj: {[id:string]:{[id:string]:{[id:string]: T}}}): number;
export function count3D<T>(obj: {[id:string]:{[id:string]:{[id:string]: T}}}, a: string): number;
export function count3D<T>(obj: {[id:string]:{[id:string]:{[id:string]: T}}}, a: string, b: string): number;
export function count3D<T>(obj: {[id:string]:{[id:string]:{[id:string]: T}}}, a: string, b: string, c: string): number;
export function count3D<T>(obj: {[id:string]:{[id:string]:{[id:string]: T}}}, a?: string, b?: string, c?: string) {
    let result = 0;
    for(const k1 of a === undefined ? Object.keys(obj): [a]) {
        const objA = getOwnProp(obj, k1);
        if (objA === undefined) {
            continue;
        }
        for(const k2 of b === undefined ? Object.keys(objA): [b]) {
            const objB = getOwnProp(objA, k2);
            if (objB === undefined) {
                continue;
            }
            if (c === undefined) {
                result += Object.keys(objB).length;
            } else {
                if (Object.prototype.hasOwnProperty.call(objB, c)) {
                    result++;
                }
            }
        }
    }
    return result;
}

export { hasKey, mergeDeep, update, deepCopy, deepEqual, isObject, noUndef };