import * as Redux from 'redux';
import Log from './shared/Log';
import * as Actions from './Actions';
import * as BackendStore from './BackendStore';
import * as Store from './Store';
import Notifier from "./Notifier";

const logger = Log.logger(__filename);


function detectScreenStatusByAnimationFrame(cb:(status: boolean)=>(void))
{
    let status:boolean|undefined = undefined;
    let handle:number|undefined;
    setInterval(()=> {
        if (handle !== undefined) {
            window.cancelAnimationFrame(handle);
            handle = undefined;
            if (status !== undefined) {
                status = false;
                cb(status);
            }
        }
        window.requestAnimationFrame(()=> {
            handle = undefined;
            if (status !== true) {
                status = true;
                cb(status);
            }
        });
    }, 5000);
}

function detectScreenStatusByFocusEvents(cb:(status: boolean)=>(void))
{
    window.addEventListener('blur', ()=> {
        cb(false);
    });
    window.addEventListener('focus', ()=> {
        cb(true);
    });
}


export default class ReduxNotifier extends Notifier {
    private readonly hidden: string;
    private readonly visibilityChange: string;
    private hidingTimeout: number | undefined;
    private store: Redux.Store<Store.Content>;
    private watchActive: boolean|undefined;

    private animationFrameStatus: boolean | undefined = undefined;
    private focusStatus: boolean | undefined = undefined;

    constructor() {
        super(undefined);

        if (typeof document.hidden !== "undefined") { // Opera 12.10 and Firefox 18 and later support
            this.hidden = "hidden";
            this.visibilityChange = "visibilitychange";
        } else if (typeof (document as any).msHidden !== "undefined") {
            this.hidden = "msHidden";
            this.visibilityChange = "msvisibilitychange";
        } else if (typeof (document as any).webkitHidden !== "undefined") {
            this.hidden = "webkitHidden";
            this.visibilityChange = "webkitvisibilitychange";
        }
        logger.debug('hidden property found', {hidden: this.hidden, visibilityChange: this.visibilityChange});
        document.addEventListener(this.visibilityChange, this.handleVisibilityChange, false);

        detectScreenStatusByFocusEvents((s)=> {
            if (this.focusStatus !== s) {
                this.focusStatus = s;
                this.handleVisibilityChange();
            }
        });
        /*
        detectScreenStatusByAnimationFrame((s)=> {
            if (this.animationFrameStatus !==  s) {
                this.animationFrameStatus = s;
                this.handleVisibilityChange();
            }
        });
        */
    }

    protected onStatusChanged(backendStatus: BackendStore.BackendStatusValue, backendError?: string)
    {
        if (this.store == undefined) return;
        Actions.dispatch<BackendStore.BackendActions>(this.store)("backendStatus", {
            backendStatus: backendStatus,
            backendError: backendError,
            time: new Date().getTime(),
        });

    }

    private cancelHidingTimeout() {
        if (this.hidingTimeout != undefined) {
            window.clearTimeout(this.hidingTimeout);
            this.hidingTimeout = undefined;
        }
    }

    protected screenVisible = ()=> {
        return (!document[this.hidden]) && (this.animationFrameStatus !== false) && (this.focusStatus !== false);
    }

    protected wantConn() {
        return this.watchActive || this.screenVisible();
    }

    handleVisibilityChange = ()=>{
        const screenVisible = this.screenVisible();
        if (!screenVisible) {
            logger.info('Websocket: Became hidden');
            this.cancelHidingTimeout();
            this.hidingTimeout = window.setTimeout(()=>{
                logger.info('Websocket: Hiding timeout expired');
                this.hidingTimeout = undefined;
                this.updateState();
            }, 60000);
        } else {
            logger.info('Websocket: Became visible');
            this.cancelHidingTimeout();
            this.updateState();
        }

        if (this.store !== undefined) {
            Actions.dispatch<BackendStore.BackendActions>(this.store)("screenVisible", {
                screenVisible
            });
        }
    }

    private checkWatchActive= ()=> {
        const newActive = !!this.store.getState().watch.active;
        if (newActive !== this.watchActive) {
            this.watchActive = newActive;
            logger.info("Watch active: ", newActive);
            this.updateState();
        }
    }

    public attachToStore(store: Redux.Store<Store.Content>) {
        logger.info('Websocket: attached to store');
        this.store = store;
        this.dispatchBackendStatus();

        store.subscribe(this.checkWatchActive);
        this.checkWatchActive();
    }

    protected handleNotifications(n: {batch: any[]}|{data: any}) {
        this.store.dispatch({type: "notification", ...n, time: new Date().getTime()});
    }
}