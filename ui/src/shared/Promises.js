/**
 * Created by ludovic on 20/07/17.
 */
'use strict';

const TraceError = require('trace-error');

function noop() {};

/**
 * CancelablePromise exports
 *
 *      start(arg) start the promise (may call callback directly).
 *              once started, exactly either onError, onCanceled callbacks will be called called
 *              start may be re-called later-on (promise reuse)
 *
 *      cancel(func) ask for cancelation. Cancelation may not occur at all
 *
 *      then(func(rslt)) make func called when promise realises
 *      onError(func(e)) make func called when promise fails
 *      onCancel(func()) make func called when promise is aborted using
 *
 * Constructor expects two functions:
 *      doStart(next, arg)
 *      doCancel(next)
 *
 *      next allow to report progress:
 *          next.done(result)   must be called once (error, cancel and done are exclusive)
 *          next.error(e)       must be called once (error, cancel and done are exclusive)
 *          next.cancel()       must be called once, only if next.cancelationPending() is true (error, cancel and done are exclusive)
 *          next.isActive()     either done, error or cancel has already been called ?
 *          next.setCancelFunc() set the function to call for cancelation (null if not supported)
 *          next.cancelationPending() time to call next.cancel() ?
 */
class Cancelable {
    // FIXME: do cancel should be set by doStart.
    constructor(doStart, initialDoCancel) {
        // Allow for no cancel function (does nothing)
        if (initialDoCancel == undefined || initialDoCancel == null) initialDoCancel = noop;
        var self = this;
        var onDoneList = [];
        var onErrorList = [];
        var onCanceledList = [];

        var doCancel = undefined;
        var done = false;
        var cancelRequested = false;

        function on(arr, result)
        {
            for(var i = 0; i < arr.length; ++i)
            {
                arr[i](result);
            }
            return arr.length > 0;
        }

        this.then = function(f) {
            onDoneList.push(f);
            return this;
        }

        this.onError = function(f) {
            onErrorList.push(f);
            return this;
        }

        this.onCancel = function(f) {
            onCanceledList.push(f);
            return this;
        }

        var whenDone = function(result)
        {
            if (done) {
                throw new Error("Multiple call to ondone");
            }
            done = true;
            on(onDoneList, result);
        }

        // throw error if no error handler installed
        var whenError = function(e) {
            if (done) {
                throw new Error("Multiple call to ondone");
            }
            if (!on(onErrorList, e)) throw e;
        }

        var whenCancel = function() {
            if (done) {
                throw new Error("Multiple call to ondone");
            }
            if (!cancelRequested) {
                throw new Error("cancel called will no cancel was requested");
            }
            done = true;
            on(onCanceledList);
        }

        var next = {
            done: whenDone,
            error: whenError,
            cancel: whenCancel,
            isActive: function() {
                return (!cancelRequested) && (!done);
            },
            cancelationPending: function() {
                return cancelRequested && !done;
            },
            setCancelFunc: function(f) {
                doCancel = f;
            }
        }

        this.start = function() {
            done = false;
            doCancel = noop;
            cancelRequested = false;
            try {
                doStart(next, arguments[0]);
            } catch(e) {
                // post-mortem error ?
                if (done) throw e;
                if (!done) {
                    whenError(e);
                }
            }
            return this;
        }

        // Quand cancel est appellé, on a seulement une garantie que onDone ou onCanceled va etre appellé
        // on ne sait pas lequel en fait.
        this.cancel = function() {
            if (done || cancelRequested) {
                return this;
            }

            cancelRequested = true;
            doCancel(next);
            return this;
        }
    }
}

/**
 * Timeout can wrap an existing promise and add a timeout
 * When the timeout elapse, the wrapped promise will get canceled; an error (onError) will be thrown by the Timeout promises
 *
 * Exemple:
 *        var infinite = new Promises.Cancelable(function(next) {}, function(next){ next.cancel(); });
 *        infinite.onCancel(function() {console.log('infinite got canceled'); }
 *        var finite = new Promises.Timeout(2000.0, infinite);
 *        finite.onError(console.warn); // => will print timedout
 *        finite.start();
 */
class Timeout extends Cancelable {
    constructor(delay, promise) {
        var timedout;
        var timeout;
        var next;
        var arg;
        var self;

        function cancelTimer() {
            if (timeout != undefined) {
                clearTimeout(timeout);
                timeout = undefined;
            }
        }

        promise.then(function(rslt) {
            cancelTimer();
            next.done(rslt);
        });
        promise.onError(function(e) {
            cancelTimer();
            next.error(e);
        });
        promise.onCancel(function () {
            // Annulé suite à l'atteinte du timer ?
            if (timedout && !next.cancelationPending()) {
                if (self.catchTimeoutFunc !== undefined) {
                    var rslt;
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

        super(function (n, a) {
            next = n;
            arg = arg;
            n.setCancelFunc(()=> {
                cancelTimer();
                promise.cancel();
            })
            timedout = false;
            timeout = undefined;

            timeout = setTimeout(function() {
                console.log('Timeout occured');
                timedout = true;
                promise.cancel();
            }, delay);
            promise.start();
        });
        self = this;
        this.catchTimeoutFunc = undefined;
    }

    catchTimeout(func) {
        this.catchTimeoutFunc = func;
        return this;
    }
}

class Chain extends Cancelable {
    constructor() {
        var current;
        var childs = Array.from(arguments);
        var next;

        function startChild(arg)
        {
            childs[current].start(arg);
        }

        // Install listener once
        for(var i = 0; i < childs.length; ++i)
        {
            var child = childs[i];
            child.then(function(rslt) {
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

            child.onError(function(e) {
                next.error(new TraceError("Step " + current + " failed - " + e, e));
            });

            child.onCancel(function(f) {
                if (next.cancelationPending()) {
                    next.cancel();
                } else {
                    next.error(new Error("Step " + current + " canceled by itself ?"));
                }
            });
        }


        super(function(n, arg) {
            next = n;
            n.setCancelFunc(() => {
                childs[current].cancel();
            })
            current = 0;
            if (childs.length == 0) {
                next.done(arg);
                return;
            }
            startChild(arg);
        })
    }
}

class Sleep extends Cancelable {
    constructor(delay) {
    
        super(function (next, arg) {
            var timeout = undefined;
            
            function cancelTimer() {
                if (timeout != undefined) {
                    clearTimeout(timeout);
                    timeout = undefined;
                }
            }

            next.setCancelFunc(() => {
                cancelTimer();
                next.cancel();
            });
            timeout = setTimeout(function() {
                timeout = undefined;
                next.done(arg);
            }, delay);
        });
    }
}

/** This promises encapsulate a child and gives a custom way of canceling */
class Cancelator extends Cancelable {
    constructor(doCancel, child) {
        var next;
        child.then(function(rslt) {
            if (next.cancelationPending()) {
                next.cancel();
            } else {
                next.done(rslt);
            }
        });
        child.onError((e)=>next.error(e));
        child.onCancel(()=>next.cancel());
        super(function(n, arg) {
            next = n;
            if (doCancel !== undefined) {
                n.setCancelFunc(doCancel);
            }
            child.start(arg);
        })
    }

}

class Loop extends Cancelable {
    constructor(repeat, until)
    {
        var next;
        var startArg;
        repeat.then(function(rslt) {

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
        repeat.onCancel(() => { next.cancel(); });

        super(function(n, arg) {
            next = n;
            startArg = arg;
            n.setCancelFunc(() => {repeat.cancel();});
            repeat.start(startArg);
        });
    }
}

// Receive the result of previous in callback argument
// If the callback returns an object, it is expected to be:
//  { perform: true/false, result: object }
class Conditional extends Cancelable {
    constructor(cond, promise)
    {
        var next;
        promise.then(function(rslt) {
            if (next.cancelationPending()) {
                next.cancel();
            } else {
                next.done(rslt);
            }
        });
        promise.onError((e)=> { next.error(e); });
        promise.onCancel(() => { next.cancel(); });
        super(function(n, arg) {
            next = n;
            var condResult = cond(arg);
            if (!(typeof(condResult) == "object")) {
                condResult={perform: condResult};
            }
            if (condResult.perform) {
                promise.start(condResult.result);
            } else {
                next.done(condResult.result);
            }
        });
    }
}

/** A promise that always runs immediately */
class Immediate extends Cancelable {
    constructor(f) {
        super(function(next, arg) {
            next.done(f.call(null, arg));
        });
    }
}

/** Execute the promise provided by the previous step */
class ExecutePromise extends Cancelable {
    constructor()
    {
        var child;
        super(function(next, arg) {
            child = arg;
            next.setCancelFunc(() => {
                var c = child;
                child = undefined;
                c.cancel();
            });
            console.log('Received child: arg');
            if (arg == undefined) {
                next.done();
                return;
            }
            arg.then((rslt) => { next.done(rslt); });
            arg.onError((e) => { next.error(e); });
            arg.onCancel(() => { next.cancel(); });
            arg.start();
        });
    }
}

/** Build the actual promise at last moment, using provider
 * Assume that the builded promise is new and discarded thereafter. (no reusing)
 */
class Builder extends Cancelable {
    constructor(provider)
    {
        var child;
        super(function(next, arg) {
            child = provider(arg);
            if (child == undefined) {
                next.done(arg);
                return;
            }
            next.setCancelFunc(() => {
                var c = child;
                child = undefined;
                c.cancel();
            });
            child.then((rslt) => { next.done(rslt); });
            child.onError((e) => { next.error(e); });
            child.onCancel(() => { next.cancel(); });
            child.start();
        });
    }
}


// Recognize func and call them with arg
// Otherwise, use value as is
function dynValue(o, arg)
{
    if (o instanceof Function) {
        return o(arg);
    }
    return o;

}


module.exports = {Immediate, Cancelable, Cancelator, Timeout, Chain, Sleep, ExecutePromise, Builder, Loop, Conditional, dynValue};