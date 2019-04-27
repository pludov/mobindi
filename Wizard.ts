import { AstrometryWizard } from './shared/BackOfficeStatus';
import Astrometry from "./Astrometry";

export default abstract class Wizard {
    readonly astrometry: Astrometry;
    cancelator: null | ((reason?:any)=>(void)) = null;
    wizardStatus: AstrometryWizard;
    private onNext: Array<()=>(void)> = [];

    constructor(astrometry: Astrometry) {
        this.astrometry = astrometry;
        this.wizardStatus = this.astrometry.currentStatus.runningWizard!;
    }

    abstract discard:()=>(void);
    abstract start: ()=>(Promise<void>);

    public interrupt() {
        if (this.cancelator !== null) {
            this.cancelator();
        }
    }

    public next() {
        const todo = this.onNext;
        this.onNext = [];
        for(const t of todo) {
            try {
                t();
            } catch(e) {
                console.warn("Next failed", e);
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

    async waitNext() {
        this.setPaused(true);
        this.wizardStatus.hasNext = true;
        await new Promise((resolve)=> {
            this.onNext.push(resolve);
        });
        this.wizardStatus.hasNext = false;
    }
};

