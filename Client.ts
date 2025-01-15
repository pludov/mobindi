import * as WebSocket from 'ws';
import Log from './Log';
import JsonProxy, { ComposedSerialSnapshot, SerialSnapshot, WhiteList } from './shared/JsonProxy';
import { BackofficeStatus } from './shared/BackOfficeStatus';
import ClientRequest from './ClientRequest';

const logger = Log.logger(__filename);

const clients: {[id:string]:Client} = {};

const pingDelay = 60000;

export default class Client {
    public readonly uid: string;
    
    private pendingWrites = 0;
    private writes = 0;
    private pendingDiffs = 0;
    readonly socket: WebSocket;
    private disposed: boolean;
    private requests: ClientRequest[];
    private jsonProxy: JsonProxy<BackofficeStatus>;
    private jsonSerial: ComposedSerialSnapshot;
    private jsonListenerId: string;
    private sendingTimer: NodeJS.Timeout|undefined;
    private whiteList: WhiteList;
    private pingTo: undefined|NodeJS.Timeout;

    constructor(socket:WebSocket, jsonProxy: JsonProxy<BackofficeStatus>, serverId: string, clientUid: string, whiteList: WhiteList)
    {
        this.uid = clientUid;
        clients[this.uid] = this;

        logger.info('Client connected', {...this.logContext(), whiteList});

        this.whiteList = whiteList;
        this.socket = socket;
        this.disposed = false;
        this.requests = [];
        this.jsonListener = this.jsonListener.bind(this);

        this.jsonProxy = jsonProxy;
        const initialState = this.jsonProxy.fork(whiteList);
        this.jsonSerial = initialState.serial;
        this.sendingTimer = undefined;
        this.notify({type: 'welcome', status: "ok", serverId: serverId, clientId: this.uid, data: initialState.data});
        this.jsonListenerId = this.jsonProxy.addListener(this.jsonListener);
    }

    private logContext(): object {
        return {uid: this.uid}
    }

    public attachRequest(c: ClientRequest) {
        if (!this.disposed) {
            this.requests.push(c);
        }
    }

    private sendDiff=()=>{
        if (this.sendingTimer !== undefined) {
            clearTimeout(this.sendingTimer);
            this.sendingTimer = undefined;
        }
        this.pendingDiffs = 0;
        var patch = this.jsonProxy.diff(this.jsonSerial, this.whiteList);
        if (patch !== undefined) {
            this.notify({type: 'update', status: "ok", diff: patch});
        }
    }

    private jsonListener=()=>{
        this.pendingDiffs++;
        if (this.sendingTimer === undefined) {
            this.sendingTimer = setTimeout(()=> {
                this.sendingTimer = undefined;
                this.sendDiff();
            }, 40);
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

        
            while(this.requests.length) {
                const r = this.requests[0];
                this.requests.splice(0, 1);
                r.dettach();
            }
        }
    }

    public notify=(changeEvent:any)=>{
        this.write(changeEvent);
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
            this.socket.send(JSON.stringify(event), (error)=> {
                if (error !== undefined  && error !== null) {
                    logger.warn('Failed to send', this.logContext(), error);
                    this.dispose();
                }
                this.writes--;
                this.restartPing();
            });
        } catch(e) {
            logger.warn('Failed to send', this.logContext(), e);
            this.dispose();
            return;
        }
        this.writes++;
    }

    public reply=(data:any)=>{
        // Ensure client view is up to date
        this.sendDiff();

        if (!this.disposed) {
            logger.debug('Reply message', {...this.logContext(), data});
            this.write(data);
        }
    }
}
