import IndiManager from "./IndiManager";
import { IndiConnection } from "./Indi";

// Count the duration of scope is tracking
export default class ScopeTrackCounter {
    private readonly indiManager: IndiManager;
    private readonly scope: string;

    private previousDuration: number;

    private currentState: boolean;
    private currentStart: number;
    private started:boolean = false;

    constructor(indiManager: IndiManager, scope: string) {
        this.indiManager = indiManager;
        this.scope = scope;
        this.currentState = false;
        this.currentStart = 0;
        this.previousDuration = 0;
    }

    private getState(cnx?: IndiConnection) {
        if (cnx === undefined) {
            return false;
        }
        const propState = cnx.getDevice(this.scope).getVector("TELESCOPE_TRACK_STATE").getPropertyValueIfExists("TRACK_ON");
        return "On" === propState;
    }

    private setState(newState: boolean) {
        if (newState === this.currentState) {
            return;
        }

        const now = new Date().getTime();
        if (!newState) {
            this.previousDuration += now - this.currentStart;
        }
        this.currentStart = now;
        this.currentState = newState;
    }

    private check = (cnx?: IndiConnection) => {
        const newState = this.getState(cnx);
        this.setState(newState);
    }

    public start() {
        if (this.started) {
            this.stop();
        }
        this.started = true;
        this.currentState = false;
        this.currentStart = 0;
        this.previousDuration = 0;
        this.check(this.indiManager.connection);
        this.indiManager.addConnectionListener(this.check);
    }

    public stop() {
        if (!this.started) {
            return;
        }
        this.started = false;
        this.setState(false);
        this.indiManager.removeConnectionListener(this.check);
    }

    public getElapsed(): number {
        let ret = this.previousDuration;
        if (this.currentState) {
            const now = new Date().getTime();
            ret += (now - this.currentStart);
        }
        return ret;
    }
}