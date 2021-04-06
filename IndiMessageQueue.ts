import Log from './Log';

const logger = Log.logger(__filename);

type PendingMessage = {
    // null means process asap
    elapsingTime: number|null;
    fantom?: boolean;
    message: any;
}

// Schedules messages delivery and group similar messages into one single delivery
export class IndiMessageQueue {
    // Queue contains immediate message (elapsingTime === null), then timed message in asc order
    messageQueue: PendingMessage[] = [];
    nextExpireTimer?: NodeJS.Timer;
    nextExpireTime?: number;
    messageProcessor: (message:any)=>(void);

    nextTimer?: number = undefined;
    nextTimerId?: NodeJS.Timeout = undefined;
    nextTickPending: boolean = false;

    disposed : boolean = false;
    defaultExpiration: number;

    constructor(defaultExpiration: number, messageProcessor: (message:any)=>(void))
    {
        this.defaultExpiration = defaultExpiration;
        this.messageProcessor = messageProcessor;
    }

    private flush() {
        if (this.disposed) {
            return;
        }
        while (this.messageQueue.length) {
            const head = this.messageQueue.splice(0, 1)[0];

            if (head.fantom) {
                continue;
            }

            if (head.elapsingTime !== null) {
                // A message aggregation succeeded. Restart with the exact same message, but later
                this.pushTimed({
                    elapsingTime: new Date().getTime() + this.defaultExpiration,
                    message: head.message,
                    fantom: true
                });
            }

            try {
                this.messageProcessor(head.message);
            } catch(e) {
                logger.error('indi message processing failed', e);
            }
            break;
        }

        if ((!this.disposed) && this.messageQueue.length) {
            const when = this.messageQueue[0].elapsingTime;
            if (when === null) {
                this.programImmediate();
            } else {
                this.programNotAfter(when);
            }
        }
    }

    private programNotAfter(when: number) {
        if (this.nextTickPending) {
            return;
        }
        if (this.nextTimer !== undefined) {
            if (this.nextTimer <= when) {
                return;
            }
            clearTimeout(this.nextTimerId!);
            this.nextTimerId = undefined;
            this.nextTimer = undefined;
        }

        let delay = when - new Date().getTime();
        if (delay < 0) {
            delay = 0;
        }
        this.nextTimer = when;
        this.nextTimerId = setTimeout(()=> {
            this.nextTimer = undefined;
            this.nextTimerId = undefined;
            this.flush();
        }, delay);

    }

    private programImmediate() {
        if (this.nextTimerId !== undefined) {
            clearTimeout(this.nextTimerId);
            this.nextTimerId = undefined;
            this.nextTimer = undefined;
        }

        if (!this.nextTickPending) {
            this.nextTickPending = true;
            process.nextTick(()=>{
                this.nextTickPending = false;
                this.flush()
            });
        }
    }

    private pushImmediate(entry: PendingMessage) {
        let i = 0;
        while( i < this.messageQueue.length && this.messageQueue[i].elapsingTime === null) {
            i++;
        }
        this.messageQueue.splice(i, 0, entry);
    }

    private pushTimed(newEntry: PendingMessage) {
        // Check we don't go backward in time
        if (this.messageQueue.length) {
            const lastEntry = this.messageQueue[this.messageQueue.length - 1];
            if (lastEntry.elapsingTime !== null
                && lastEntry.elapsingTime > newEntry.elapsingTime!)
            {
                newEntry.elapsingTime = lastEntry.elapsingTime;
            }
        }
        this.messageQueue.push(newEntry);
    }

    public dispose() {
        if (this.nextTimerId !== undefined) {
            clearTimeout(this.nextTimerId);
            this.nextTimerId = undefined;
            this.nextTimer = undefined;
        }
        this.messageQueue = []
        this.disposed = true;
    }

    private isDelayable(message: any) {
        return (message.$$ === 'setNumberVector'
                && message.$name === 'CCD_EXPOSURE'
                && message.$state === 'Busy');
    }

    private getPendingMessageId(message: any):number|undefined
    {
        for(let i = 0; i < this.messageQueue.length; ++i) {
            const e = this.messageQueue[i];
            if (e.elapsingTime === null) {
                continue;
            }
            if (e.message.$$ === message.$$
                && e.message.$name === message.$name
                && e.message.$state === message.$state
                && e.message.$device === message.$device) {
                return i;
            }
        }
        return undefined;
    }

    public queue(message :any) {
        if (!this.isDelayable(message)) {
            for(let i = 0; i < this.messageQueue.length;)
            {
                if (this.messageQueue[i].fantom) {
                    this.messageQueue.splice(i, 1);
                } else {
                    if (this.messageQueue[i].elapsingTime !== null) {
                        this.messageQueue[i].elapsingTime = null;
                    }
                    i++;
                }
            }
            this.messageQueue.push({
                elapsingTime: null,
                message
            });
            this.programImmediate();
        } else {
            // Find in the queue a pending message with the same prop & co
            const existingMessagePos = this.getPendingMessageId(message);
            if (existingMessagePos !== undefined) {
                this.messageQueue[existingMessagePos].message = message;
                if (this.messageQueue[existingMessagePos].fantom) {
                    logger.debug('Throttling INDI messages', {op: message.$$, device: message.$device, name: message.$name});
                    this.messageQueue[existingMessagePos].fantom = false;
                }
            } else {
                this.pushImmediate({
                    elapsingTime: null,
                    message
                });

                // Push a fantom entry, that will aggregate in between messages
                const newEntry = {
                    elapsingTime : new Date().getTime() + this.defaultExpiration,
                    message: message,
                    fantom: true,
                };
                this.pushTimed(newEntry);

                this.programImmediate();
            }
        }
    }
};