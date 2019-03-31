import { Task } from "./Task";
import Client from "./Client";

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
        console.log('Request ' + this.uid + ' failure notification: ' + err);
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
        console.log('Request ' + this.uid + ' succeeded: ' + JSON.stringify(rslt));
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
        console.log('Request ' + this.uid + ' canceled');
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
