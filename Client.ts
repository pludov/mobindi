import * as WebSocket from 'ws';
import JsonProxy, { ComposedSerialSnapshot, SerialSnapshot, WhiteList } from './JsonProxy';
import { BackofficeStatus } from './shared/BackOfficeStatus';
import ClientRequest from './ClientRequest';

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

        this.log('Client ' + this.uid + ' connected with whitelist :' + JSON.stringify(whiteList));
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

    private log=(message:string)=>{
        console.log('Notification channeld ' + this.uid+ ': ' + message);
    }

    public dispose=()=>{
        if (!this.disposed) {
            this.disposed = true;
            console.log('Closed notification channel ' + this.uid);
            if (this.socket != undefined) {
                try {
                    this.socket.close();
                } catch(e) {
                    this.log('Failed to close: ' + e);
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
        console.log('pinging client ' + this.uid);
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
                if (error !== undefined) {
                    this.log('Failed to send: ' + error);
                    this.dispose();
                }
                this.writes--;
                this.restartPing();
            });
        } catch(e) {
            this.log('Failed to send: ' + e);
            this.dispose();
            return;
        }
        this.writes++;
    }

    public reply=(data:any)=>{
        // Ensure client view is up to date
        this.sendDiff();

        if (!this.disposed) {
            console.log('Message to ' + this.uid + ':' + JSON.stringify(data));
            this.write(data);
        }
    }
}
