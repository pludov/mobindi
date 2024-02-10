import CancellationToken from "cancellationtoken";

/**
 * A task is a promise with a CancellationToken
 * It can inherit from a "parent" cancellationToken (canceling the parent will cancel the promise, if not already done)
 */
export interface Task<T> extends Promise<T> {
    readonly cancellation: CancellationToken;
    readonly cancel: (reason?: any)=>(void);
}

export function createTask<T>(
                parentCancelation?: CancellationToken,
                code?:(task: Task<T>)=>Promise<T>
            ):Task<T> {
    let child:any = {};
    let resolve: (value?: T | PromiseLike<T> | undefined) => void;
    let reject: (reason?: any) => void;

    const ret:any = new Promise<T | PromiseLike<T> | undefined>((tresolve, treject) => {
        resolve = tresolve;
        reject = treject;
    });

    const {token, cancel} = CancellationToken.create();
    ret.cancellation = token;
    ret.cancel = cancel;

    (async ()=> {
        const whenDone = (parentCancelation !== undefined) 
            ? parentCancelation.onCancelled(cancel)
            :undefined;
        try {
            if (code) {
                let result: T;
                try {
                    result = await code(ret);
                } catch(e) {
                    ret.cancel=()=>{};
                    reject!(e);
                    return;
                }
                ret.cancel=()=>{};
                resolve!(result);
            }
        } finally {
            if (whenDone !== undefined) {
                whenDone();
            }
        }
    })();

    return ret;
}

