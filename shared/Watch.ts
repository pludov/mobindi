import CancellationToken from 'cancellationtoken';


// Hold a value with ways to get notified when the value meet a condition
export class Watch<Something> {
    value: Something;
    watchers: Map<string, ()=>void> = new Map();
    watcherNum: number = 0;
    
    constructor(s: Something) {
        this.value = s;
        this.watchers = new Map();
    }

    addCb(cb: ()=>void) : ()=>void {
        const id = (this.watcherNum++).toString();
        this.watchers.set(id, cb);
        return ()=> {
            this.watchers.delete(id);
        };
    }

    waitAnything(ct: CancellationToken):Promise<void> {
        return new Promise((res, rej) => {
            ct.throwIfCancelled();


            let resCb: undefined|(()=>void);
            let cancelCb: undefined|(()=>void);

            resCb = this.addCb(() => {
                unregister();
                res()
            });
            cancelCb = ct.onCancelled((reason)=> {
                unregister();
                rej(new CancellationToken.CancellationError(reason));
            });

            function unregister() {
                if (resCb !== undefined) {
                    resCb();
                    resCb = undefined;
                }
                if (cancelCb !== undefined) {
                    cancelCb();
                    cancelCb = undefined;
                }
            }
        });
    }

    // Perform an update. For object/array, it is mandatory to return a new instance
    public update(update: (s: Something)=>Something) {
        const oldValue = this.value;
        const newValue = update(oldValue);
        if (newValue === oldValue) {
            return;
        }
        this.value = newValue;
        const toNotifyKeys = Array.from(this.watchers.keys());
        for(const k of toNotifyKeys) {
            let cb = this.watchers.get(k);
            if (cb === undefined) {
                continue;
            }
            this.watchers.delete(k);
            setImmediate(cb);
        }
    }

    // Wait until a value is reached. Quick consecutive changes (during the same eventloop iter) may be lost
    public async waitFor(ct: CancellationToken, predicate: (s:Something)=>boolean) : Promise<Something> {
        while (!predicate(this.value)) {
            await this.waitAnything(ct);
        }
        return this.value;
    }

}