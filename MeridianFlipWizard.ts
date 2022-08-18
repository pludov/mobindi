import CancellationToken from 'cancellationtoken';
import Log from './Log';
import Wizard from "./Wizard";

import Sleep from './Sleep';


const logger = Log.logger(__filename);

export default class MeridianFlipWizard extends Wizard {
    sessionStartTimeStamp : string = "";

    getScope() {
        const scope = this.astrometry.currentStatus.selectedScope;
        if (!scope) {
            throw new Error("no scope selected");
        }
        return scope;
    }

  
    start = async ()=> {
        this.wizardStatus.title = "Meridian flip";

        this.wizardStatus.meridianFlip = {
            status: "initialConfirm",
        }

        const wizardReport = this.wizardStatus.meridianFlip!;

        logger.info("Meridian flip wizard started");
        await this.waitNext(wizardReport!.status === "initialConfirm" ? "Start >>" : "Resume");
        if (!this.sessionStartTimeStamp) {
            this.sessionStartTimeStamp = new Date().toISOString().replace(/\.\d+|[-:]/g,'');
        }
        wizardReport!.status = "acquireInitialPosition";
        const {token, cancel} = CancellationToken.create();
        this.setInterruptor(cancel);

        logger.info("Meridian flip wizard sleeping");

        await Sleep(token, 5000);
        wizardReport!.status = "done";
        this.setPaused(true);
        logger.info("Meridian flip wizard done");
    }
}