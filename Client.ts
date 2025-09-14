import * as WebSocket from 'ws';
import Log from './Log';
import JsonProxy, { ComposedSerialSnapshot, SerialSnapshot, WhiteList } from './shared/JsonProxy';
import { BackofficeStatus } from './shared/BackOfficeStatus';
import ClientRequest from './ClientRequest';

const logger = Log.logger(__filename);

const clients: {[id:string]:Client} = {};

const pingDelay = 60000;


type SendQueueItem = {
    // Perform a sendDiff before sending the payload
    sendDiff: boolean;
    payload: any;
    cb?: (err?:any)=>void;
}

type Probe = {
    type: "srvProbe",
    id: number;
    offset: number;
    time: number;
}

export default class Client {
    public readonly uid: string;
    
    // Byte counter of transmitted characters
    private writes = 0;
    private lastProbeAcked: Probe | undefined;
    private lastProbeSent: Probe| undefined;
    private laggingWarning : number|undefined;

    readonly socket: WebSocket;
    private disposed: boolean;
    private jsonProxy: JsonProxy<BackofficeStatus>;
    private jsonSerial: ComposedSerialSnapshot;
    private jsonListenerId: string;
    private sendDiffTimer: {id: NodeJS.Timeout}|undefined;
    private whiteList: WhiteList;
    private pingTo: undefined|NodeJS.Timeout;
    private sendQueue:Array<SendQueueItem>;

    requests: Map<string, ClientRequest> = new Map();
    constructor(socket:WebSocket, jsonProxy: JsonProxy<BackofficeStatus>, serverId: string, clientUid: string, whiteList: WhiteList)
    {
        this.uid = clientUid;
        clients[this.uid] = this;

        logger.info('Client connected', {...this.logContext(), whiteList});

        this.sendQueue = [];
        this.whiteList = whiteList;
        this.socket = socket;
        this.disposed = false;
        this.jsonListener = this.jsonListener.bind(this);

        this.jsonProxy = jsonProxy;
        const initialState = this.jsonProxy.fork(whiteList);
        this.jsonSerial = initialState.serial;
        this.sendDiffTimer = undefined;
        this.enqueue({
            sendDiff: false,
            payload: {type: 'welcome', status: "ok", serverId: serverId, clientId: this.uid, data: initialState.data}
        });
        this.jsonListenerId = this.jsonProxy.addListener(this.jsonListener);
    }

    private logContext(): object {
        return {uid: this.uid}
    }

    private enqueue(sendQueueItem: SendQueueItem) {
        if (this.disposed) {
            return;
        }
        this.sendQueue.push(sendQueueItem);
        this.flushSendQueue();
    }

    private async transmit(sendQueueItem: SendQueueItem) {
        if (this.disposed) {
            return;
        }

        return new Promise((res, rej)=> {
            sendQueueItem.cb = res;
            this.enqueue(sendQueueItem);
        });

    }

    private flushSendQueue() {
        if (this.disposed) {
            // callback for sendqueueitem...
            this.sendQueue.splice(0, this.sendQueue.length).forEach((e)=> {
                if (e.cb) {
                    setImmediate(e.cb);
                }  
            });
            return;
        }


        if (!this.sendQueue.length) {
            return;
        }

        // Send a traffic probe every 64k, or every 0.5s, whatever comes first
        // Traffic will not proceed until the last probe has been acked

        // Check if we must wait for a probe (right after the second was sent)
        if (this.lastProbeSent && this.lastProbeSent.id > 0) {
            // Waiting for probe
            const now = new Date().getTime();

            if (this.lastProbeSent.time + 1000 < now) {
                if (this.laggingWarning == undefined) {
                    logger.warn("Client is lagging over 1000ms", {...this.logContext(), lastProbeSent: this.lastProbeSent, lastProbeAcked: this.lastProbeAcked});
                    this.laggingWarning = now;
                }
            } else {
                if (this.laggingWarning) {
                    this.laggingWarning = undefined;
                    logger.info("Client is back under 1000ms", {...this.logContext(), lastProbeSent: this.lastProbeSent, lastProbeAcked: this.lastProbeAcked});
                }
            }

            if ((!this.lastProbeAcked) || (this.lastProbeAcked.id < this.lastProbeSent.id - 1)) {
                return;
            }
        }
        if (this.laggingWarning) {
            this.laggingWarning = undefined;
            logger.info("Client is back under 1000ms", {...this.logContext(), lastProbeSent: this.lastProbeSent, lastProbeAcked: this.lastProbeAcked});
        }

        let maxOffset = (this.lastProbeSent?.offset || 0) + 65536;
        while((!this.disposed) && this.sendQueue.length && (this.writes < maxOffset)) {
            const item = this.sendQueue.splice(0, 1)[0];
            if (item.sendDiff) {
                const patch = this.getPendingDiff();
                if (patch !== undefined) {
                    this.write(patch);
                }
            }
            if ((item.payload)&&!(this.disposed)) {
                this.write(item.payload);
            }
            if (item.cb) {
                setImmediate(item.cb);
            }
        }

        let now = new Date().getTime();
        if ((this.writes >= maxOffset) || ((this.lastProbeSent?.time || 0) + 500 < now)) {
            logger.debug("Sending probe", {...this.logContext(), writes: this.writes, lastProbeSent: this.lastProbeSent, lastProbeAcked: this.lastProbeAcked, queueLength: this.sendQueue.length, bufferedAmount: this.socket.bufferedAmount});
            this.lastProbeSent = {
                time: now,
                offset: this.writes,
                id: ( this.lastProbeSent === undefined ? 0 : this.lastProbeSent.id + 1),
                type: "srvProbe"
            }
            this.write(this.lastProbeSent);
        }
    }

    onProbeReceived(p: Probe) {
        // FIXME: use the time delta ?
        this.lastProbeAcked = p;
        // If the acked probe is the last sent, we can proceed
        this.flushSendQueue();
    }

    private getPendingDiff=()=>{
        if (this.sendDiffTimer !== undefined) {
            clearTimeout(this.sendDiffTimer.id);
            this.sendDiffTimer = undefined;
        }
        const patch = this.jsonProxy.diff(this.jsonSerial, this.whiteList);
        if (patch !== undefined) {
            return {type: 'update', status: "ok", diff: patch};
        } else {
            return undefined;
        }
    }

    private jsonListener=()=>{
        if (this.sendDiffTimer === undefined) {
            const timer = {
                id: setTimeout(async ()=> {
                    await this.transmit({
                        sendDiff: true,
                        payload: undefined,
                    });
                    if (this.sendDiffTimer === timer) {
                        this.sendDiffTimer = undefined;
                    }
                }, 40)
            };
            this.sendDiffTimer = timer;
        }
    }

    public dispose=()=>{
        if (!this.disposed) {
            this.disposed = true;
            logger.info('Closed notification channel', {uid: this.uid});
            if (this.socket != undefined) {
                try {
                    this.socket.close();
                } catch(e) {
                    logger.error('Failed to close', {uid: this.uid}, e);
                }
            }
            this.jsonProxy.removeListener(this.jsonListenerId);
            delete clients[this.uid];

            for(const request of Array.from(this.requests.values())) {
                request.requestCancellation("Client disconnected");
                request.dettach();
            }
        }
    }


    private ping=()=>{
        logger.info('pinging client', {uid: this.uid});
        this.write({});
    }

    private restartPing = ()=> {
        if (this.pingTo !== undefined) {
            clearTimeout(this.pingTo);
            this.pingTo = undefined;
        }
        if (!this.disposed) {
            this.pingTo = setTimeout(this.ping, pingDelay * (0.75 + Math.random() / 2));
        }
    }

    private write=(event:any)=>{
        try {
            if (this.disposed) {
                return;
            }
            const payload = JSON.stringify(event);
            const byteSize = payload.length;
            this.writes += byteSize;
            this.socket.send(payload, (error)=> {
                if (error !== undefined  && error !== null) {
                    logger.warn('Failed to send', this.logContext(), error);
                    this.dispose();
                }
                this.restartPing();
            });
        } catch(e) {
            logger.warn('Failed to send', this.logContext(), e);
            this.dispose();
            return;
        }
    }

    public reply=(payload:any)=>{
        if (!this.disposed) {
            logger.debug('Reply message', {...this.logContext(), payload});
            this.enqueue({
                // Ensure client view is up to date
                sendDiff: true,
                payload
            });
        }
    }

    public stream=async (payload: any)=> {
        if (!this.disposed) {
            logger.debug('Stream message', {...this.logContext(), payload});
            await this.transmit({
                // Ensure client view is up to date
                sendDiff: true,
                payload
            });
        }
    }

    cancelRequested = (id: string) => {
        const request = this.requests.get(id);
        if (request !== undefined) {
            logger.info("Cancelling request as asked by client", {...this.logContext(), id});
            request?.requestCancellation("Explicit abort requested");
        } else {
            logger.warn("Cancellation request for an unknown request", {...this.logContext(), id});
        }
    }

    newRequest=(id: string) => {
        const uid = this.uid + ":" + id;
        const requestDesc = new ClientRequest(uid, this);
        const existing = this.requests.get(uid);
        // Insert in the list of active requests
        if (existing) {
            logger.warn("Multiple request with same id from client", {uid});
            existing.requestCancellation("Duplicate request id");
        }
        this.requests.set(id, requestDesc);
        return requestDesc;
    }
}
