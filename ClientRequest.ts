import Log from './Log';
import { Task } from "./Task";
import Client from "./Client";

const logger = Log.logger(__filename);

export default class ClientRequest {
    private promise: Task<any>|undefined;
    cancelRequested: boolean;
    uid: string;
    client: Client|undefined;
    finalStatus: any;

    constructor(uid:string, fromClient:Client) {
        this.promise = undefined;
        this.cancelRequested = false;
        this.uid = uid;

        this.client = fromClient;
        this.client.attachRequest(this);
        // What was sent when promise terminated
        this.finalStatus = {
            type: 'requestEnd',
            uid: uid,
            status: 'error',
            message: 'internal error'
        };
    }

    private logContext(): object {
        return {uid: this.uid, clientUid: this.client?.uid};
    }

    // Dettach request from client
    dettach() {
        this.client = undefined;
    }

    dispatch(content:any) {
        if (this.client === undefined) {
            return;
        }
        this.client.reply(content);
    }

    onError(err:any) {
        if (err == undefined) {
            err = null;
        } else {
            err = err.stack || '' + err;
        }
        logger.warn('Request error', this.logContext(), err);
        this.promise = undefined;
        this.finalStatus = {
            type: 'requestEnd',
            uid: this.uid,
            status: 'error',
            message: err
        };
        this.dispatch(this.finalStatus);
        this.dettach();
    }

    success (rslt:any) {
        if (rslt == undefined) rslt = null;
        logger.info('Request success', this.logContext());
        logger.debug('Request result', {...this.logContext, rslt});
        this.promise = undefined;
        this.finalStatus = {
            type: 'requestEnd',
            uid: this.uid,
            status: 'done',
            result: rslt
        };
        this.dispatch(this.finalStatus);
        this.dettach();
    }

    onCancel() {
        logger.info('Request canceled', this.logContext());
        this.promise = undefined;
        this.finalStatus = {
            type: 'requestEnd',
            uid: this.uid,
            status: 'canceled'
        };
        this.dispatch(this.finalStatus);
        this.dettach();
    }
}
