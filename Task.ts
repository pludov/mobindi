import CancellationToken from "cancellationtoken";

/**
 * A task is a promise with a CancellationToken
 * It can inherit from a "parent" cancellationToken (canceling the parent will cancel the promise, if not already done)
 */
export default class Task<T> extends Promise<T>{
    public readonly cancellation: CancellationToken;
    public readonly resolve: (value?: T | PromiseLike<T> | undefined) => void;
    public readonly reject: (reason?: any) => void;
    public readonly cancel: (reason?: any) => void;

    constructor(parentCancelation: CancellationToken, code?:(task: Task<T>)=>Promise<T>) {
        let tresolve : this['resolve'], treject: this['reject'];
        super((resolve, reject)=> {
            tresolve = resolve;
            treject = reject;
        });
        this.resolve = tresolve!;
        this.reject = treject!;
        const {token, cancel} = CancellationToken.create();
        this.cancellation = token;
        this.cancel = cancel;

        if (parentCancelation) {
            const whenDone = parentCancelation.onCancelled(this.cancel);
            this.catch(whenDone);
            this.then(whenDone);
        }

        (async ()=> {
            if (code) {
                let result: T;
                try {
                    result = await code(this);
                } catch(e) {
                    treject!(e);
                    return;
                }
                tresolve!(result);
            }
        })();
    }
};
