/**
 * Created by ludovic on 20/07/17.
 */
'use strict';

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
            if (!on(onErrorList, e)) throw e;
        }

        var next = {
            done: whenDone,
            error: whenError,
            isActive: function() {
                return (!cancelRequested) && (!done);
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

            this.cancelRequested = true;
            doCancel();
            return this;
        }
    }

}

module.exports = CancelablePromise;