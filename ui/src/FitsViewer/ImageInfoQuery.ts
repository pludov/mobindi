import Log from '../shared/Log';
import $ from 'jquery';
import './FitsViewer.css'
import { ImageSize } from './Types';

const logger = Log.logger(__filename);

// Query to CGI to gather image details
class ImageInfoQuery {
    path: string;
    ajax: JQueryXHR|null = null;
    listeners: Array<{id: Object, cb: (w: ImageSize|null)=>void}> = [];

    constructor(path: string) {
        this.path = path;
    }

    register(id: Object, cb: (w: ImageSize|null)=>void) {
        return new Promise((res, rej)=> {
            this.listeners.push({
                id,
                cb
            });
        });
    }

    // This will abort if last registered unregister
    unregister(id: Object) {
        for(let i = 0 ; i < this.listeners.length;) {
            if (this.listeners[i].id === id) {
                this.listeners.splice(i, 1);
            } else {
                i++;
            }
        }
        if (this.listeners.length === 0 && this.ajax !== null) {
            const ajax = this.ajax;
            // This will prevent call of cb
            this.ajax = null;
            ajax.abort();
        }
    }

    broadcast(rslt: ImageSize|null) {
        for(const target of [...this.listeners]) {
            target.cb(rslt);
        }
    }

    start() {
        this.ajax = $.ajax({
            url: 'fitsviewer/fitsviewer.cgi?size=true&' + this.path,
            dataType: 'json',
            error: (e)=>{
                if (this.ajax !== null) {
                    logger.error('size query had error', {path: this.path}, e);
                    this.ajax = null;
                    this.broadcast(null);
                }
            },
            success: (d)=> {
                if (this.ajax !== null) {
                    logger.debug('size query done', {path: this.path, d});
                    this.ajax = null;
                    this.broadcast(d);

                }
            },
            timeout: 30000
        });
    }
}

export default ImageInfoQuery;