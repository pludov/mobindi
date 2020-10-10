
/**
 * Start a promise and binds it to the state of component (a number of running promises)
 * 
 */
async function promiseToState<T>(promise:()=>Promise<T>, component: React.Component, prop='runningPromise'):Promise<T>
{
    function inc(value:number) {
        component.setState((prevState, props) => {
            var current = prevState[prop];
            if (!current) current = 0;
            return Object.assign({}, prevState, {
                [prop]: current + value
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


export {promiseToState, noErr, has};