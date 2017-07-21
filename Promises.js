/**
 * Created by ludovic on 20/07/17.
 */
'use strict';

const TraceError = require('trace-error');

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
 *      doStart(next)
 *      doCancel(next)
 *
 *      next allow to report progress:
 *          next.done(result)   must be called once (error, cancel and done are exclusive)
 *          next.error(e)       must be called once (error, cancel and done are exclusive)
 *          next.cancel()       must be called once, only if next.cancelationPending() is true (error, cancel and done are exclusive)
 *          next.isActive()     either done, error or cancel has already been called ?
 *          next.cancelationPending() time to call next.cancel() ?
 */
class Cancelable {
    constructor(doStart, doCancel) {
        // Allow for no cancel function (does nothing)
        if (doCancel == undefined) doCancel = function() {};

        var self = this;
        var onDoneList = [];
        var onErrorList = [];
        var onCanceledList = [];

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
        }

        this.onCancel = function(f) {
            onCanceledList.push(f);
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
            }
        }

        this.start = function() {
            done = false;
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
        this.cancel = function(onCancel) {
            if (onCancel) {
                onCanceledList.push(onCancel);
            }

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
            if (timedout) {
                next.error("timeout");
            } else {
                next.cancel();
            }
        });

        super(function (n) {
            next = n;
            timedout = false;
            timeout = undefined;

            timeout = setTimeout(function() {
                console.log('Timeout occured');
                timedout = true;
                promise.cancel();
            }, delay);
            promise.start();
        }, function(n) {
            cancelTimer();
            promise.cancel();
        });
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
                    startChild(rslt);
                }
            });

            child.onError(function(e) {
                next.error(new TraceError("Step " + current + " failed", e));
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
            current = 0;
            if (childs.length == 0) {
                next.done(arg);
                return;
            }
            startChild(arg);
        }, function(n) {
            childs[current].cancel();
        })
    }
}

class Sleep extends Cancelable {
    constructor(delay) {
        var timeout = undefined;

        function cancelTimer() {
            if (timeout != undefined) {
                clearTimeout(timeout);
                timeout = undefined;
            }
        }

        super(function (next, arg) {
            timeout = setTimeout(function() {
                timeout = undefined;
                next.done(arg);
            }, delay);
        }, function(next) {
            cancelTimer();
            next.cancel();
        });
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
                    // restart repeat FIXME: loop get transformed in deep recursion ???
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
            repeat.start(startArg);
        }, function(c) {
            repeat.cancel();
        });
    }
}

module.exports = {Cancelable, Timeout, Chain, Sleep, Loop};