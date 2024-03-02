
/**
 * Start a promise and binds it to the state of component (a number of running promises)
 * 
 */
type FilteredKeys<T, U> = keyof { [P in keyof T]: T[P] extends U ? P : never };

async function promiseToStateProp<T,STATE, PROPS>(promise:()=>Promise<T>, component: React.Component<PROPS, STATE>, prop: FilteredKeys<STATE, number>& string):Promise<T>
{
    const actualProp: FilteredKeys<STATE, number>&string = prop as any;
    function inc(value:number) {
        component.setState((prevState, props) => {
            let current: number = prevState[actualProp] as any;
            if (!current) current = 0;
            return Object.assign({}, prevState, {
                [actualProp]: current + value
            });
        });
    }

    try {
        inc(1);
        const t:T = await promise();
        return t;
    } finally {
        inc(-1);
    }
}

async function promiseToState<T,STATE extends {runningPromise: number}, PROPS>(promise:()=>Promise<T>, component: React.Component<PROPS, STATE>):Promise<T>
{
    return await promiseToStateProp(promise, component, 'runningPromise');
}

// Evaluate f function, but if fail, return def
function noErr<T,R>(f:()=>T, def:R):T|R
{
    try  {
        return f();
    } catch(e) {
        return def;
    }
}

function has(o: any, s: undefined|null):false;
function has(o: any, s: string):boolean;
function has(o: any, s: any):boolean {
    if (o === null || o === undefined) {
        return false;
    }
    if (s === null || s === undefined) {
        return false;
    }

    return Object.prototype.hasOwnProperty.call(o, s);
}

export function getOwnProp<T>(o: {[id: string]: T}, s: string):T|undefined;
export function getOwnProp<T>(o: {[id: string]: T}|undefined|null, s: string):T|undefined;
export function getOwnProp<T>(o: {[id: string]: T}, s: undefined|null):undefined;
export function getOwnProp<T>(o: {[id: string]: T}|undefined|null, s: string|undefined|null):T|undefined;
export function getOwnProp<T>(o: undefined|null, s: any):undefined;

export function getOwnProp(o: any, s: any) {
    if (s === null || s === undefined) {
        return undefined;
    }
    if (has(o, s)) {
        return o![s];
    }
    return undefined;
}

export function shallowEqual<T>(a: null | undefined | {[id: string]: T}, b: null | undefined | {[id: string]: T}): boolean {
    if (a === b) return true;
    if (a === null) return false;
    if (b === null) return false;
    if (a === undefined) return false;
    if (b === undefined) return false;

    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) {
        return false;
    }
    aKeys.sort();
    bKeys.sort();
    if (!isArrayEqual(aKeys, bKeys)) {
        return false;
    }
    for(const key of aKeys) {
        if (a[key] !== b[key]) {
            return false;
        }
    }
    return true;
}

export function isArrayEqual<U>(a : U, b: U): boolean
{
    if (a === b) {
        return true;
    }
    if (a === null) {
        return false;
    }
    if (b === null) {
        return false;
    }
    if (Array.isArray(a)) {
        if (Array.isArray(b)) {
            if (a.length !== b.length) {
                return false;
            }

            for(let i = 0; i < a.length; ++i) {
                if (a[i] !== b[i]) {
                    return false;
                }
            }
            return true;
        }
    }
    return false;
}


export {promiseToState, promiseToStateProp, noErr, has};