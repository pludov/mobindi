import React from 'react';

import './FitsViewerWithAstrometry.css';
import "./FitsViewerFineSlewUI.css";

export default class SlewButtonController {
    timer?: NodeJS.Timeout;
    abort: ()=>Promise<void>;
    send: ()=>Promise<void>;
    sendingCount: number = 0;
    // Stop as soon as sendingCount hits 0
    stopRequested: boolean = false;

    currentOperation : Promise<void>;

    constructor(send : ()=>Promise<void>, abort : ()=>Promise<void>)
    {
        this.send = send;
        this.abort = abort;
    }

    private clearTimer=()=>{
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = undefined;
        }
    }

    private doSend = async ()=> {
        this.sendingCount++;
        try {
            await this.send();
        } finally {
            this.sendingCount--;
            if (this.stopRequested && this.sendingCount === 0) {
                this.stopRequested = false;
                this.abort();
            }
        }
    }

    private start= async ()=>{
        if (this.timer) {
            return;
        }
        this.timer = setInterval(this.doSend, 500);
        this.stopRequested = false;
        this.doSend();
    }

    public stop=()=>{
        if (this.timer) {
            this.clearTimer();

            if (this.sendingCount > 0) {
                this.stopRequested = true;
            } else {
                this.abort();
            }
        }
    }

    // When a generic abort is sent, prevent this button from sending any more commands
    public interrupted=()=>{
        if (this.timer) {
            this.clearTimer();
        }
        // In case something is beeing sent, we'll need to stop it as soon as possible
        if (this.sendingCount > 0) {
            this.stopRequested = true;
        }
    }

    buttonProperties = (): React.InputHTMLAttributes<HTMLInputElement> => {
        return {
            onMouseDown: this.start,
            onMouseUp: this.stop,
            onMouseOut: this.stop,

            onTouchStart: this.start,
            onTouchEnd: this.stop,
            onTouchEndCapture: this.stop,
            onTouchCancel: this.stop,
        }
    }
};

