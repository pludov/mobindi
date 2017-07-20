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
class CancelablePromise {
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

module.exports = CancelablePromise;