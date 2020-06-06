import * as Redux from 'redux';
import * as Actions from './Actions';
import * as BackendStore from './BackendStore';
import * as Store from './Store';
import Notifier from "./Notifier";

export default class ReduxNotifier extends Notifier {
    private readonly hidden: string;
    private readonly visibilityChange: string;
    private hidingTimeout: number | undefined;
    private store: Redux.Store<Store.Content>;

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
        console.log('hidden property: ' + this.hidden);
        document.addEventListener(this.visibilityChange, this.handleVisibilityChange.bind(this), false);
    }

    protected onStatusChanged(backendStatus: BackendStore.BackendStatusValue, backendError?: string)
    {
        if (this.store == undefined) return;
        Actions.dispatch<BackendStore.BackendActions>(this.store)("backendStatus", {
            backendStatus: backendStatus,
            backendError: backendError
        });

    }

    private cancelHidingTimeout() {
        if (this.hidingTimeout != undefined) {
            window.clearTimeout(this.hidingTimeout);
            this.hidingTimeout = undefined;
        }
    }

    protected wantConn() {
        return !document[this.hidden];
    }

    handleVisibilityChange() {
        if (document[this.hidden]) {
            console.log('Websocket: Became hidden');
            this.cancelHidingTimeout();
            this.hidingTimeout = window.setTimeout(()=>{
                console.log('Websocket: Hiding timeout expired');
                this.hidingTimeout = undefined;
                this.updateState();
            }, 10000);
        } else {
            console.log('Websocket: Became visible');
            this.cancelHidingTimeout();
            this.updateState();
        }
    }

    public attachToStore(store: Redux.Store<Store.Content>) {
        console.log('Websocket: attached to store');
        this.store = store;
        this.dispatchBackendStatus();
    }

    protected handleNotifications(n: {batch: any[]}|{data: any}) {
        this.store.dispatch({type: "notification", ...n});
    }
}