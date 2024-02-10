import CancellationToken from 'cancellationtoken';
import Log from './Log';
import { AstrometryWizard } from './shared/BackOfficeStatus';
import Astrometry from "./Astrometry";

const logger = Log.logger(__filename);

export default abstract class Wizard {
    readonly astrometry: Astrometry;
    cancelator: null | ((reason?:any)=>(void)) = null;
    wizardStatus: AstrometryWizard;
    private onNext: Array<()=>(void)> = [];
    private onDiscard: Array<()=>(void)> = [];

    constructor(astrometry: Astrometry) {
        this.astrometry = astrometry;
        this.wizardStatus = this.astrometry.currentStatus.runningWizard!;
    }

    abstract start: ()=>(Promise<void>);

    public interrupt() {
        if (this.cancelator !== null) {
            this.cancelator();
        }
    }

    public discard=()=> {
        const todo = this.onDiscard;
        this.onNext = [];
        this.onDiscard = [];
        for(const t of todo) {
            try {
                t();
            } catch(e) {
                logger.error("Discard failed", e);
            }
        }
    }

    public next() {
        const todo = this.onNext;
        this.onNext = [];
        this.onDiscard = [];
        for(const t of todo) {
            try {
                t();
            } catch(e) {
                logger.error("Next failed", e);
            }
        }
    }

    // If the user request abort, interruptor will get called
    protected setInterruptor(interruptor:null | ((reason?:any)=>(void))) {
        this.cancelator = interruptor;
        if (interruptor !== null) {
            this.wizardStatus.paused = false;
        }
        this.wizardStatus.interruptible = interruptor !== null;
    }

    // When paused, the wizard can get discarded
    protected setPaused(paused: boolean) {
        this.setInterruptor(null);
        this.wizardStatus.paused = paused;
    }

    // called when start promise resolves/reject. Make sure user can take control back
    killed() {
        this.wizardStatus.paused = true;
    }

    async waitNext(nextTitle:string = "next") {
        this.setPaused(true);
        this.wizardStatus.hasNext = nextTitle;
        await new Promise<void>((resolve, reject)=> {
            this.onNext.push(resolve);
            this.onDiscard.push(()=> {
                reject(new CancellationToken.CancellationError("User abort"));
            });
        });
        this.wizardStatus.hasNext = null;
    }
};

