import * as WebSocket from 'ws';
import JsonProxy, { ComposedSerialSnapshot, SerialSnapshot } from './JsonProxy';
import { BackofficeStatus } from './shared/BackOfficeStatus';
import ClientRequest from './ClientRequest';

const clients: {[id:string]:Client} = {};
let clientId = 0;

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

    constructor(socket:WebSocket, jsonProxy: JsonProxy<BackofficeStatus>, serverId: string)
    {
        this.uid = "#" + (clientId++);
        clients[this.uid] = this;

        this.log('Client ' + this.uid + ' connected');
        this.socket = socket;
        this.disposed = false;
        this.requests = [];
        this.jsonListener = this.jsonListener.bind(this);

        this.jsonProxy = jsonProxy;
        var initialState = this.jsonProxy.fork();
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
        console.log('Client: sending diff after ' + this.pendingDiffs + ' notifications');
        this.pendingDiffs = 0;
        var patch = this.jsonProxy.diff(this.jsonSerial);
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
        console.log('Sending notification to '+ this.uid + ': ' + JSON.stringify(changeEvent, null, 2));
        this.write(changeEvent);
    }

    private write=(event:any)=>{
        try {
            this.socket.send(JSON.stringify(event), (error)=> {
                if (error !== undefined) {
                    this.log('Failed to send: ' + error);
                    this.dispose();
                }
                this.writes--;
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
