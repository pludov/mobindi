import CancellationToken from 'cancellationtoken';
import Wizard from "./Wizard";

import sleep from "./Sleep";

export default class PolarAlignementWizard extends Wizard {
    discard = ()=> {}

    start = async ()=> {
        this.wizardStatus.title = "Polar alignment";

        this.wizardStatus.polarAlignment = {
            status: "initialConfirm",
        }

        while(true) {
            await this.waitNext();
            this.wizardStatus.polarAlignment!.status = "running";
            const {token, cancel} = CancellationToken.create();
            this.setInterruptor(cancel);
            try {

                // TODO: put the real code for polar alignment...
                // TODO: deep copy parameters on the first pass
                try {
                    await sleep(token, 2000);
                    break;
                } finally {
                    this.setInterruptor(null);
                    this.setPaused(true);
                }

            } catch(e) {
                if (e instanceof CancellationToken.CancellationError) {
                    this.wizardStatus.polarAlignment!.status = "paused";
                } else {
                    throw e;
                }
            }
        }
        this.wizardStatus.polarAlignment!.status = "done";
        this.setPaused(true);
    }
}