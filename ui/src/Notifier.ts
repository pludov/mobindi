// Detecter l'état de visibilité de la page
import CancellationToken from "cancellationtoken";
import Log from './shared/Log';
import { BackendStatus, BackendStatusValue } from './BackendStore';
import { WhiteList } from './shared/JsonProxy';

const logger = Log.logger(__filename);

class Request {
    readonly notifier: Notifier;
    readonly requestData: any;
    readonly requestId: number;
    readonly type: string;
    uid: string | undefined;
    canceled: boolean;
    readonly resolve: (e: any) => void;
    readonly reject: (err: any) => void;

    constructor(notifier: Notifier, requestData: any, requestId: number, resolve: (e:any)=>(void), reject:(err:any)=>(void), type?: string) {
        this.notifier = notifier;
        this.type = type || "startRequest";
        this.requestData = requestData;
        this.requestId = requestId;

        // Callback for done, onError, onCancel...
        this.resolve = resolve;
        this.reject = reject;

        // Set when first send
        this.uid = undefined;

        // cancel was called on client side ?
        this.canceled = false;
    }

    setClientId(clientId:string) {
        this.uid = clientId + ':' + this.requestId;
    }

    wasSent() {
        return this.uid !== undefined;
    }
}

function appLoadingFeedback(feedback: () => any) {
    if (window.parent && window.parent !== window) {
        console.log('Parent window detected');
        const queryString = document.location.search;
        const urlParams = new URLSearchParams(queryString);
        const startupDispatchToken = urlParams.get('startupDispatchToken');
        if (startupDispatchToken) {
            console.log('Startup dispatch token detected');

            // Send the startup dispatch token to the parent window
            window.parent.postMessage({
                ...feedback(),
                startupDispatchToken: startupDispatchToken
            }, '*');
        }
    }
}

appLoadingFeedback(()=>({type: 'starting'}));

export default class Notifier {
    private sendingQueueMaxSize: number;
    private suspended: boolean;
    private uniqRequestId: number;
    private clientId: string|undefined;
    private serverId: string|undefined;
    private socket: WebSocket|undefined;
    private url: string|undefined;
    private toSendRequests: Request[];
    private toCancelRequests: Request[];
    private activeRequests: {[id:string]:Request};
    private resendTimer: NodeJS.Timeout|undefined;
    private handshakeOk: boolean|undefined;

    private pendingMessageCount: number;
    private pendingUpdateAsk: {};
    // FIXME: not used
    private xmitTimeout: number | undefined;

    private readonly whiteList: WhiteList;

    constructor(whiteList: WhiteList) {
        this.socket = undefined;
        this.sendingQueueMaxSize = 1000;
        this.whiteList = whiteList;
        this.resetHandshakeStatus(false);

        this.suspended = true;
        this.url = undefined;

        // Request to server are emited with this id
        this.uniqRequestId = 0;

        // The server send that id on each connection.
        // Request are sent using uid: clientId:uniqRequestId
        this.clientId = undefined;


        // Received on welcome. Used to detect server restarts.
        this.serverId = undefined;

        // uniqRequestId => Request objects
        this.toSendRequests = [];
        this.toCancelRequests = [];
        this.activeRequests = {};

        this.resendTimer = undefined;

    }


    protected onStatusChanged(backendStatus: BackendStatusValue, backendError?: string)
    {}

    protected dispatchBackendStatus(error?: string|null)
    {

        if (error !== undefined && error !== null) {
            this.onStatusChanged(BackendStatus.Failed, error);
            return;
        }
        if (this.handshakeOk) {
            this.onStatusChanged(BackendStatus.Connected);
            return;
        }
        if (this.socket == null) {
            // On est caché: on est en pause
            if (!this.wantConn()) {
                this.onStatusChanged(BackendStatus.Paused);
                return;
            }
            // On devrait etre connecté
            this.onStatusChanged(BackendStatus.Failed);
            return;
        } else {
            this.onStatusChanged(BackendStatus.Connecting);
        }
    }
    
    private resetHandshakeStatus(status:boolean, clientId?:string)
    {
        this.handshakeOk = status;
        this.pendingUpdateAsk = {};
        this.pendingMessageCount = 0;
        if (status) {
            this.clientId = clientId;
        }
        this.clearXmitTimeout();

        // Detect if a startup dispatch token has been passed in the URL
        if (status) {
            appLoadingFeedback(() => ({
                type: 'connected',
            }));
        }
    }

    private sendingQueueReady() {
        return this.handshakeOk &&
            this.socket!.bufferedAmount < this.sendingQueueMaxSize;
    }

    private sendAsap() {
        if (this.resendTimer != undefined) {
            clearTimeout(this.resendTimer);
            this.resendTimer = undefined;
        }

        let sthSent = false;
        while((this.toSendRequests.length || this.toCancelRequests.length) && this.sendingQueueReady()) {
            sthSent = true;
            if (this.toCancelRequests.length) {
                const toCancel = this.toCancelRequests.splice(0, 1)[0];
                this.write({
                    'type': 'cancelRequest',
                    'uid': toCancel.uid
                });
            } else {
                const toSend = this.toSendRequests.splice(0, 1)[0];
                toSend.setClientId(this.clientId!);
                this.activeRequests[toSend.uid!] = toSend;
                this.write({
                    'type': toSend.type,
                    id: toSend.requestId,
                    details: toSend.requestData
                });
            }
        }
        // Add a timer to restart asap
        // FIXME: would prefer a notification from websocket !
        if (this.toSendRequests.length || this.toCancelRequests.length) {
            this.resendTimer = setTimeout(()=>{
                this.resendTimer = undefined;
                this.sendAsap();
            }, 100);
        }
   }


    // Returns a promise that will execute the request
    // Except an object with at least target and method property set
    // will call an API method on server side
    // FIXME: make this cancelable
    public sendRequest<Q,R>(content:Q, type?: string):Promise<R> {
        return new Promise<R>((resolve, reject) => {
            if (!this.handshakeOk) {
                throw "Backend not connected";
            }
            const request = new Request(this, {... content}, this.uniqRequestId++, resolve, reject, type);
            this.toSendRequests.push(request);
            this.sendAsap();
        });
    }

    // Called on reconnection when backend was restarted.
    // abort all pending requests
    private failStartedRequests(error:any) {
        const toDrop = Object.keys(this.activeRequests);
        for(let i = 0; i < toDrop.length; ++i) {
            const uid = toDrop[i];
            if (!Object.prototype.hasOwnProperty.call(this.activeRequests, uid)) continue;
            const request = this.activeRequests[uid];
            delete this.activeRequests[uid];

            for(let j = 0 ; this.toCancelRequests.length;) {
                if (this.toCancelRequests[j] === request) {
                    this.toCancelRequests.splice(j, 1);
                } else {
                    j++;
                }
            }

            try {
                request.reject(error);
            } catch(e) {
                logger.error('onCancel error', e);
            }
        }
    }

    private write(obj:any)
    {
        try {
            this.socket!.send(JSON.stringify(obj));
        } catch(e) {
            logger.warn('Websocket: write failed', e);
            this._close();
            this.dispatchBackendStatus();
        }
    }

    private clearXmitTimeout() {
        if (this.xmitTimeout != undefined) {
            clearTimeout(this.xmitTimeout);
            this.xmitTimeout = undefined;
        }
    }

    public connect(apiRoot:string) {
        let webSocketRoot = apiRoot + "notifications";
        webSocketRoot = "ws" + webSocketRoot.substr(4);
        this.url = webSocketRoot;

        this.updateState();
    }

    protected wantConn() {
        return true;
    }

    protected updateState()
    {
        const wantedConn = this.wantConn();
        if (wantedConn) {
            if (!this.socket) {
                // FIXME: delay ?
                logger.debug('Websocket: restart needed');
                this._open();
            }
        } else {
            if (this.socket) {
                logger.debug('Websocket: close required');
                this._close();
                this.dispatchBackendStatus();
            }
        }
    }

    protected handleNotifications(n: {batch: any[]}|{data: any}) {};

    private _open() {
        if (!this.url) {
            return;
        }
        logger.info('Websocket: connecting', {url: this.url});
        this.resetHandshakeStatus(false);
        try {
            this.socket = new WebSocket(this.url!);
            this.dispatchBackendStatus();
        } catch(e) {
            logger.warn('Websocket: failed to open', e);
            this.socket = undefined;
            this.dispatchBackendStatus('' + e);
        }

        if (this.socket) {
            let notifications:any[] = [];
            let flushTimeout: NodeJS.Timeout|undefined = undefined;
            let inactivityTimeout: NodeJS.Timeout|undefined = undefined;
            const orgSocket = this.socket;

            const discardEvent = (event:string)=>{
                if (this.socket !== orgSocket) {
                    logger.warn('Discarding event from old socket', {event});
                    return true;
                }
                return false;
            }

            const flushNotifications=()=>{
                if (flushTimeout !== undefined) {
                    clearTimeout(flushTimeout);
                    flushTimeout = undefined;
                }

                if (discardEvent("flushNotifications")) return;

                if (notifications.length) {
                    const toSend = notifications;
                    notifications = [];

                    // logger.debug('batching notifications: ', toSend.length);
                    this.handleNotifications({batch: toSend});
                }
            }

            const pushNotification=(diff:any)=>{
                notifications.push(diff);
                if (flushTimeout === undefined) {
                    flushTimeout = setTimeout(()=> {
                        flushTimeout = undefined;
                        flushNotifications();
                    }, 40);
                }
            }

            const discardInactivityTimeout=()=>{
                if (inactivityTimeout) {
                    clearTimeout(inactivityTimeout);
                    inactivityTimeout = undefined;
                }
            }

            const resetInactivityTimeout=()=>{
                discardInactivityTimeout();
                inactivityTimeout = setTimeout(()=> {
                    inactivityTimeout = undefined;
                    orgSocket.close();
                }, 120000);
            };

            this.socket.onopen = (data)=>{
                if (discardEvent("onopen")) return;
                logger.info('Websocket: connected');
                resetInactivityTimeout();

                this.write({
                    type: "auth",
                    whiteList: this.whiteList,
                });
            };
            this.socket.onmessage = (event)=>{
                if (discardEvent("onmessage")) return;
                resetInactivityTimeout();

                const data = JSON.parse(event.data);
                if (data.type == 'welcome') {
                    logger.info('Websocket: welcomed', {data});
                    this.resetHandshakeStatus(true, data.clientId);
                    this.serverId = data.serverId;

                    this.handleNotifications({data: data.data});
                }

                if (data.type == 'requestEnd') {
                    flushNotifications();
                    const uid = data.uid;
                    if (Object.prototype.hasOwnProperty.call(this.activeRequests, uid)) {
                        const request = this.activeRequests[uid];
                        delete(this.activeRequests[uid]);
                        this.toCancelRequests = this.toCancelRequests.filter((item)=>(item.uid !== uid));
                        logger.info('Request status', {uid, status: data.status});
                        try {
                            switch(data.status) {
                                case 'done':
                                    request.resolve(data.result);
                                    break;
                                case 'canceled':
                                    request.reject(new Error("Canceled on server side"));
                                    break;
                                default:
                                    request.reject(data.message);
                                    break;
                            }
                        } catch(e) {
                            logger.error('Request end failed', {uid, status: data.status}, e);
                        }
                    } else {
                        logger.info('Request status', {uid});
                    }
                }

                if (data.type=="update") {
                    pushNotification(data.diff);
                }
            };
            this.socket.onclose = (data)=>{
                discardInactivityTimeout();
                if (discardEvent("onclose")) return;

                logger.info('Websocket: closed');
                flushNotifications();
                this.socket = undefined;
                this.resetHandshakeStatus(false);
                this.dispatchBackendStatus();
                this.failStartedRequests("Backend disconnected");
                setTimeout(()=>{
                    this.updateState();
                }, 1000);
            };
            this.socket.onerror = (error)=>{
                discardInactivityTimeout();
                if (discardEvent("onerror")) return;

                logger.error('Websocket: error', {url: this.url, error});
                flushNotifications();
                this._close();
                this.dispatchBackendStatus('Connection aborted');
                setTimeout(()=>{
                    this.updateState();
                }, 2000);
            };
        }
    }

    private _close() {
        if (this.socket == undefined) return;

        logger.info('Websocket: disconnecting');
        try {
            this.socket.close();
        } catch(e) {
            logger.error('Websocket Failed to close', e);
        }
        this.resetHandshakeStatus(false);
        this.socket = undefined;
    }
}
