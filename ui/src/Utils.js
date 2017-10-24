
/**
 * Start a promise and binds it to the state of component (a number of running promises)
 * 
 */
function promiseToState(promise, component, prop='runningPromise')
{
    function inc(value) {
        component.setState((prevState, props) => {
            var current = prevState[prop];
            if (!current) current = 0;
            return Object.assign({}, prevState, {
                [prop]: current + value
            });
        });
    }

    promise.onError(()=>inc(-1));
    promise.onCancel(()=>inc(-1));
    promise.then(()=>inc(-1));

    inc(1);
    promise.start();
}

// Evaluate f function, but if fail, return def
function noErr(f, def)
{
    try  {
        return f();
    } catch(e) {
        return def;
    }
}

export {promiseToState, noErr};