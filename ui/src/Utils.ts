
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

function has(o: any, s: string) {
    return Object.prototype.hasOwnProperty.call(o, s);
}

export function getOwnProp<T>(o: {[id: string]: T}, s: string):T|undefined {
    if (has(o, s)) {
        return o[s];
    }
    return undefined;
}

export {promiseToState, noErr, has};