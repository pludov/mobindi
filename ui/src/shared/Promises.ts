/**
 * Created by ludovic on 20/07/17.
 */
import assert from 'assert';

import Log from './Log';

/* tslint:disable:max-classes-per-file */

const logger = Log.logger(__filename);

const noop = ()=>{};

type StatusNotifier<Output> = {
    done: (result: Output)=>(void);
    error: (e: any)=>(void);
    cancel: ()=>(void);
    isActive: ()=>(boolean);
    cancelationPending: ()=>(boolean);
    setCancelFunc: (doCancel:()=>(void))=>(void);
};

type StartFunction<Input, Output> = (next: StatusNotifier<Output>, arg: Input) => (void);
type ThenCallback<Output> = (result: Output)=>(void);
type OnErrorCallback = (e: any)=>(void);
type OnCancelCallback = ()=>(void);

/**
 * CancelablePromise exports following methods
 *
 *      start(arg) start the promise (may call callback directly).
 *              once started, exactly either onDone, onError, onCanceled callbacks will be called
 *              start may be re-called later-on (promise reuse)
 *
 *      then(func(rslt)) make func called when promise realises
 *      onError(func(e)) make func called when promise fails
 *      onCancel(func()) make func called when promise is aborted using
 *
 *      cancel(func) ask for cancelation. Cancelation may not occur at all
 *
 * Constructor expects one functions:
 *      doStart(next, arg)
 *
 *      doStart is called with "next" object, that allow to report progress:
 *          next.done(result)   must be called once (error, cancel and done are exclusive)
 *          next.error(e)       must be called once (error, cancel and done are exclusive)
 *          next.cancel()       must be called once, only if next.cancelationPending() is true (error, cancel and done are exclusive)
 *          next.isActive()     either done, error or cancel has already been called ?
 *          next.setCancelFunc() set the function to call for cancelation (null if not supported)
 *          next.cancelationPending() time to call next.cancel() ?
 */
export class Cancelable<Input, Output> {
    public then: (cb: ThenCallback<Output>)=>Cancelable<Input, Output>;
    public onError: (cb: OnErrorCallback)=>Cancelable<Input, Output>;
    public onCancel: (cb: OnCancelCallback)=>Cancelable<Input, Output>;
    
    // Start the promise. The promise can be done before the return to the caller. Error occuring during startup will be thrown
    public start:(i:Input)=>Cancelable<Input, Output>;

    public cancel:()=>Cancelable<Input, Output>;

    constructor(doStart: StartFunction<Input, Output>) {
        const self = this;
        const onDoneList: ThenCallback<Output>[] = [];
        const onErrorList: OnErrorCallback[] = [];
        const onCanceledList: OnCancelCallback[] = [];

        let doCancel = noop;
        let done = false;
        let cancelRequested = false;

        function on<T>(arr:((i:T)=>(void))[], result: T)
        {
            for(const item of arr)
            {
                item(result);
            }
            return arr.length > 0;
        }

        this.then = (f) => {
            onDoneList.push(f);
            return this;
        }

        this.onError = (f) => {
            onErrorList.push(f);
            return this;
        }

        this.onCancel = (f) => {
            onCanceledList.push(f);
            return this;
        }

        const whenDone = (result:Output) => {
            if (done) {
                throw new Error("Multiple call to ondone");
            }
            done = true;
            on(onDoneList, result);
        }

        // throw error if no error handler installed
        const whenError = (e:any) => {
            if (done) {
                throw new Error("Multiple call to ondone");
            }
            if (!on(onErrorList, e)) {
                throw e;
            }
        }

        const whenCancel = () => {
            if (done) {
                throw new Error("Multiple call to ondone");
            }
            if (!cancelRequested) {
                throw new Error("cancel called will no cancel was requested");
            }
            done = true;
            on(onCanceledList, undefined);
        }

        const next:StatusNotifier<Output> = {
            done: whenDone,
            error: whenError,
            cancel: whenCancel,
            isActive: () => {
                return (!cancelRequested) && (!done);
            },
            cancelationPending: () => {
                return cancelRequested && !done;
            },
            setCancelFunc: (f) => {
                doCancel = f;
            }
        }

        this.start = (i: Input) => {
            done = false;
            doCancel = noop;
            cancelRequested = false;
            try {
                doStart(next, i);
            } catch(e) {
                // post-mortem error ?
                if (done) {
                    throw e;
                }
                if (!done) {
                    whenError(e);
                }
            }
            return this;
        }

        // Quand cancel est appellé, on a seulement une garantie que onDone ou onCanceled va etre appellé
        // on ne sait pas lequel en fait.
        this.cancel = () => {
            if (done || cancelRequested) {
                return this;
            }

            cancelRequested = true;
            try {
                doCancel();
            } catch(e) {
                logger.error("Cancel failed - ignoring", e);
            }
            return this;
        }
    }
}


type TimeoutHandler<Input, Output>=(i:Input)=>(Output);
/**
 * Timeout can wrap an existing promise and add a timeout
 * When the timeout elapse, the wrapped promise will get canceled; an error (onError) will be thrown by the Timeout promises
 *
 * Exemple:
 *        var infinite = new Promises.Cancelable(function(next) {}, function(next){ next.cancel(); });
 *        infinite.onCancel(function() {logger.debug('infinite got canceled'); }
 *        var finite = new Promises.Timeout(2000.0, infinite);
 *        finite.onError(logger.warn); // => will print timedout
 *        finite.start();
 */
export class Timeout<Input, Output> extends Cancelable<Input, Output> {
    private catchTimeoutFunc: TimeoutHandler<Input, Output>|undefined;
    constructor(delay: number, promise: Cancelable<Input, Output>) {
        let timedout:boolean;
        let timeout: NodeJS.Timeout|undefined;
        let next: StatusNotifier<Output>;
        let arg:Input;
        let self:Timeout<Input, Output>;

        function cancelTimer() {
            if (timeout !== undefined) {
                clearTimeout(timeout);
                timeout = undefined;
            }
        }

        promise.then((rslt) => {
            cancelTimer();
            next.done(rslt);
        });
        promise.onError((e) => {
            cancelTimer();
            next.error(e);
        });
        promise.onCancel(() => {
            // Annulé suite à l'atteinte du timer ?
            if (timedout && !next.cancelationPending()) {
                if (self.catchTimeoutFunc !== undefined) {
                    let rslt;
                    try {
                        rslt = self.catchTimeoutFunc(arg);
                    } catch(e) {
                        next.error(e);
                        return;
                    }
                    next.done(rslt);
                } else {
                    next.error("timeout");
                }
            } else {
                next.cancel();
            }
        });

        super((n, a) => {
            next = n;
            arg = arg;
            n.setCancelFunc(()=> {
                cancelTimer();
                promise.cancel();
            })
            timedout = false;
            timeout = undefined;

            timeout = setTimeout(() => {
                logger.debug('Timeout occured');
                timedout = true;
                promise.cancel();
            }, delay);
            // fixed: argument was not passed
            promise.start(arg);
        });
        self = this;
        this.catchTimeoutFunc = undefined;
    }

    // func will be called in case of timeout, after proper cancelation.
    // It can either throw an error or return a valid result
    public catchTimeout(func: TimeoutHandler<Input, Output>) {
        this.catchTimeoutFunc = func;
        return this;
    }
}

type ConcurrentItemStatus = {
    running: boolean;
    cancelRequested: boolean;
    result: any|undefined;
};

// Starts all promises (or less in case of error)
// Report the first error - wait for all childs to terminate
// Cancel all childs in case of error
// Return the value of all childs
export class Concurrent<Input> extends Cancelable<Input, any[]> {
    constructor(...childs : Cancelable<Input, any>[]) {
        let next:StatusNotifier<any[]>|undefined;
        let error:any;
        let done:boolean = true;
        const status:ConcurrentItemStatus[] = [];
        for(let i = 0; i < childs.length; ++i) {
            const s = {
                running: false,
                cancelRequested: false,
                result: undefined
            }
            status[i] = s;
            childs[i].then(rslt=> {
                s.running = false;
                s.result = rslt;
                progress();
            });
            childs[i].onError(err=> {
                s.running = false;
                if (error === undefined) {
                    error = err;
                }
                progress();
            });
            childs[i].onCancel(()=> {
                s.running = false;
                progress();
            });
        }

        function active() {
            for(let i = 0; i < childs.length; ++i) {
                if (status[i].running) {
                    return true;
                }
            }
            return false;
        }

        function finish() {
            done = true;
            if (error) {
                next!.error(error);
                return;
            }
            
            if (next!.cancelationPending()) {
                next!.cancel();
                return;
            }

            const result = status.map(s=>s.result);
            next!.done(result);
        }

        function progress() {
            assert(!done);

            if (error) {
                // Check that every runnning childs is canceled
                for(let i = 0; i < childs.length; ++i) {
                    if (status[i].running && !status[i].cancelRequested) {
                        status[i].cancelRequested = true;
                        try {
                            childs[i].cancel();
                        } catch(error) {
                            logger.error('Ignoring child cancel error', {child: i}, error);
                        }
                    }
                }
                if (!active()) {
                    finish();
                }
            } else {
                if (!active()) {
                    finish();
                }
            }
        }

        super((n, arg) => {
            assert(done);
            next = n;
            // Cleanup previous state
            error = undefined;
            done = false;
            for(let i = 0; i <  childs.length; ++i) {
                status[i].running = false;
                status[i].cancelRequested = false;
                status[i].result = undefined;
            }
            for(let i = 0; i <  childs.length; ++i) {
                try {
                    status[i].running = true;
                    childs[i].start(arg);
                } catch(err) {
                    error = err;
                    status[i].running = false;
                    progress();
                    return;
                }
                if (done) {
                    return;
                }
            }
        });
    }
}

export class Chain<Input, Output> extends Cancelable<Input, Output> {
    constructor(...childs:Cancelable<any, any>[]) {
        let current: number;
        let next : StatusNotifier<Output>;

        function startChild(arg: any)
        {
            childs[current].start(arg);
        }

        // Install listener once
        for(const child of childs)
        {
            child.then((rslt:any) => {
                current++;
                if (current >= childs.length) {
                    next.done(rslt);
                } else {
                    if (next.cancelationPending()) {
                        next.cancel();
                    } else {
                        startChild(rslt);
                    }
                }
            });

            child.onError((e:any) => {
                next.error(e);
            });

            child.onCancel(() => {
                if (next.cancelationPending()) {
                    next.cancel();
                } else {
                    next.error(new Error("Step " + current + " canceled by itself ?"));
                }
            });
        }


        super((n, arg) => {
            next = n;
            n.setCancelFunc(() => {
                childs[current].cancel();
            })
            current = 0;
            if (childs.length === 0) {
                next.done(arg as any as Output);
                return;
            }
            startChild(arg);
        })
    }
}

export class Sleep<Arg> extends Cancelable<Arg, Arg> {
    constructor(delay:number) {

        super((next, arg) => {
            let timeout: NodeJS.Timeout|undefined;

            function cancelTimer() {
                if (timeout !== undefined) {
                    clearTimeout(timeout);
                    timeout = undefined;
                }
            }

            next.setCancelFunc(() => {
                cancelTimer();
                next.cancel();
            });
            timeout = setTimeout(() => {
                timeout = undefined;
                next.done(arg);
            }, delay);
        });
    }
}

/** This promises encapsulate a child and gives a custom way of canceling */
export class Cancelator<Input, Output> extends Cancelable<Input, Output> {
    constructor(doCancel:()=>(void)|undefined, child: Cancelable<Input, Output>) {
        let next : StatusNotifier<Output>;
        child.then((rslt) => {
            if (next.cancelationPending()) {
                next.cancel();
            } else {
                next.done(rslt);
            }
        });
        child.onError((e)=>next.error(e));
        child.onCancel(()=>{
            if (next.cancelationPending()) {
                next.cancel();
            } else {
                next.error(new Error("Child canceled"));
            }
        });
        super((n, arg) => {
            next = n;
            if (doCancel !== undefined) {
                n.setCancelFunc(doCancel);
            }
            child.start(arg);
        })
    }

}

export class Loop<Input, Output> extends Cancelable<Input, Output> {
    constructor(repeat: Cancelable<Input, Output>, until?: (o:Output)=>boolean)
    {
        let next: StatusNotifier<Output>;
        let startArg: Input;
        repeat.then((rslt) => {

            if ((!until) || !until(rslt)) {
                if (next.cancelationPending()) {
                    next.cancel();
                } else {
                    // restart repeat FIXME: loop can be transformed in deep recursion ???
                    repeat.start(startArg);
                    return;
                }
            }
            next.done(rslt);
        });
        repeat.onError((e)=> { next.error(e); });
        repeat.onCancel(() => {
            if (next.cancelationPending()) {
                next.cancel();
            } else {
                next.error(new Error("Child canceled"));
            }
        });

        super((n, arg) => {
            next = n;
            startArg = arg;
            n.setCancelFunc(() => {repeat.cancel();});
            repeat.start(startArg);
        });
    }
}


type ConditionalResult<Intermediate, Output> = boolean | {
    perform: boolean;
    result?: Intermediate|Output;
}

// Receive the result of previous in callback argument
// If the callback returns an object, it is expected to be:
//  { perform: true/false, result: object }
export class Conditional<Input, Intermediate, Output> extends Cancelable<Input, Output> {
    constructor(cond:(i:Input)=>ConditionalResult<Intermediate, Output>, promise: Cancelable<Intermediate, Output>)
    {
        let next: StatusNotifier<Output>;;
        promise.then((rslt) => {
            if (next.cancelationPending()) {
                next.cancel();
            } else {
                next.done(rslt);
            }
        });
        promise.onError((e)=> { next.error(e); });
        promise.onCancel(() => {
            if (next.cancelationPending()) {
                next.cancel();
            } else {
                next.error(new Error("Child canceled"));
            }
        });
        super((n, arg) => {
            next = n;
            let condResult = cond(arg);
            if (!(typeof(condResult) === "object")) {
                condResult={perform: condResult as any as boolean};
            }
            if (condResult.perform) {
                promise.start(condResult.result! as Intermediate);
            } else {
                next.done(condResult.result! as Output);
            }
        });
    }
}

/** A promise that always runs immediately */
export class Immediate<Input, Output> extends Cancelable<Input, Output> {
    constructor(f:(i:Input)=>Output) {
        super((next, arg) => {
            next.done(f.call(null, arg));
        });
    }
}

/** Execute the promise provided by the previous step */
export class ExecutePromise<Input extends Cancelable<undefined, Output>, Output> extends Cancelable<Input, Output> {
    constructor()
    {
        let child: Cancelable<any, Output> | undefined;
        super((next, arg) => {
            child = arg;
            next.setCancelFunc(() => {
                const c = child;
                child = undefined;
                c!.cancel();
            });

            if (!arg) {
                next.done(undefined as any);
                return;
            }
            arg.then((rslt) => { next.done(rslt); });
            arg.onError((e) => { next.error(e); });
            arg.onCancel(() => {
                if (next.cancelationPending()) {
                    next.cancel();
                } else {
                    next.error(new Error("Child canceled"));
                }
            });
            arg.start(undefined);
        });
    }
}

/** Build the actual promise at last moment, using provider
 * Assume that the builded promise is new and discarded thereafter. (no reusing)
 */
export class Builder<Input, Output> extends Cancelable<Input, Output> {
    constructor(provider:(i:Input)=>Cancelable<undefined, Output>|undefined)
    {
        let child : Cancelable<undefined, Output> | undefined;
        super((next, arg) => {
            child = provider(arg);
            if (!child) {
                next.done(arg as any as Output);
                return;
            }
            next.setCancelFunc(() => {
                const c = child;
                child = undefined;
                c!.cancel();
            });
            child.then((rslt) => { next.done(rslt); });
            child.onError((e) => { next.error(e); });
            child.onCancel(() => {
                if (next.cancelationPending()) {
                    next.cancel();
                } else {
                    next.error(new Error("Child canceled"));
                }
            });
            child.start(undefined);
        });
    }
}


export type DynValueProvider<T,I> = T|((arg:I)=>T);

// Recognize func and call them with arg
// Otherwise, use value as is
export function dynValue<T, I>(o: DynValueProvider<T,I>, arg : I)
{
    if (o instanceof Function) {
        return o(arg);
    }
    return o;

}

