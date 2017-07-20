/**
 * Created by ludovic on 20/07/17.
 */
'use strict';


/**
 * CancelablePromise exports
 *
 *      start() start the promise (may call callback directly).
 *              once started, exactly either onError, onCanceled callbacks will be called called
 *
 *      cancel(func) ask for cancelation. Cancelation may not occur at all
 *
 *      then(func(f)) make func called when promise realises
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
                throw "Multiple call to ondone";
            }
            done = true;
            on(onDoneList, result);
        }

        // throw error if no error handler installed
        var whenError = function(e) {
            if (done) {
                throw "Multiple call to ondone";
            }
            if (!on(onErrorList, e)) throw e;
        }

        var whenCancel = function() {
            if (done) {
                throw "Multiple call to ondone";
            }
            if (!cancelRequested) {
                throw "cancel called will no cancel was requested";
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
            try {
                doStart(next);
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
        var timedout = false;
        var timeout = undefined;

        function cancelTimer() {
            if (timeout != undefined) {
                clearTimeout(timeout);
                timeout = undefined;
            }
        }

        super(function (next) {
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
            timeout = setTimeout(function() {
                console.log('Timeout occured');
                timedout = true;
                promise.cancel();
            }, delay);
            promise.start();
        }, function(next) {
            cancelTimer();
            promise.cancel();
        });
    }

}

module.exports = {Cancelable, Timeout};