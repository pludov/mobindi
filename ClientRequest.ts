import Log from './Log';
import { Task } from "./Task";
import Client from "./Client";

const logger = Log.logger(__filename);

export default class ClientRequest {
    uid: string;
    client: Client|undefined;
    finalStatus: any;

    app: string;
    func: string;

    cancelRequested: boolean = false;
    interruptible: boolean = false;
    cancelReason: any;
    task?: Task<any>;

    constructor(uid:string, fromClient:Client) {
        this.cancelRequested = false;
        this.app = "???";
        this.func = "???";
        this.uid = uid;

        this.client = fromClient;
        // What was sent when promise terminated
        this.finalStatus = {
            type: 'requestEnd',
            uid: uid,
            status: 'error',
            message: 'internal error'
        };
    }

    // Dettach request from client
    // This prevent further communication attempts
    dettach() {
        if (this.client === undefined) {
            return;
        }

        if (this.client.requests.get(this.uid) === this) {
            this.client.requests.delete(this.uid);
        }
        this.client = undefined;
    }

    dispatch(content:any) {
        if (this.client === undefined) {
            return;
        }
        this.client.reply(content);
    }

    readonly onError=(err:any)=>{
        if (err == undefined) {
            err = null;
        } else {
            err = err.stack || '' + err;
        }
        logger.warn('Request error', this.logContext(), err);
        this.finalStatus = {
            type: 'requestEnd',
            uid: this.uid,
            status: 'error',
            message: err
        };
        this.dispatch(this.finalStatus);
        this.dettach();
    }

    readonly stream = async (payload: any) => {
        logger.debug('Request streaming', {...this.logContext(), payload});
        this.dispatch({
            type: 'requestStream',
            uid: this.uid,
            payload
        });
    }

    readonly success= (rslt:any)=>{
        if (rslt == undefined) rslt = null;
        logger.info('Request success', this.logContext());
        logger.debug('Request result', {...this.logContext(), rslt});
        this.finalStatus = {
            type: 'requestEnd',
            uid: this.uid,
            status: 'done',
            result: rslt
        };
        this.dispatch(this.finalStatus);
        this.dettach();
    }

    onCanceled() {
        logger.info('Request canceled', this.logContext());
        this.finalStatus = {
            type: 'requestEnd',
            uid: this.uid,
            status: 'canceled'
        };
        this.dispatch(this.finalStatus);
        this.dettach();
    }

    logContext() {
        return {
            globalUid: this.uid,
            app: this.app,
            func: this.func,
        }
    }

    cancelIfRequested() {
        if (!this.cancelRequested) {
            return;
        }
        if (!this.interruptible) {
            return;
        }
        logger.warn('Requesting cancellation of api call', this.logContext());
        this.task?.cancel(this.cancelReason);
    }

    setInterruptible=(interruptible: boolean)=>{
        if (this.interruptible === interruptible) {
            return;
        }

        logger.debug('Request interruptible changed', {...this.logContext(), interruptible});
        this.interruptible = interruptible;

        this.cancelIfRequested();
    }

    requestCancellation(reason: any) {
        if (this.cancelRequested) {
            logger.debug('Multiple request cancellation ignored', {...this.logContext(), reason});
            return;
        }
        logger.info('Request cancellation asked', {...this.logContext(), reason});
        this.cancelRequested = true;
        this.cancelReason = reason;

        this.cancelIfRequested();
    }

}
