import CancellationToken from 'cancellationtoken';
import Wizard from "./Wizard";

import sleep from "./Sleep";
import { PolarAlignSettings } from './shared/BackOfficeStatus';
import Sleep from './Sleep';
import { createTask } from './Task';

export default class PolarAlignementWizard extends Wizard {
    discard = ()=> {}

    getScope() {
        const scope = this.astrometry.currentStatus.selectedScope;
        if (!scope) {
            throw new Error("no scope selected");
        }
        return scope;
    }

    readRa():number {
        // Inserts a sleep to ensure data is up to date ?
        const vec = this.astrometry.indiManager.getValidConnection().getDevice(this.getScope()).getVector("EQUATORIAL_EOD_COORD");
        const ra = parseFloat(vec.getPropertyValue("RA"));
        console.log('current ra', ra);
        return ra;
    }

    async prepareScope(ct: CancellationToken, settings:PolarAlignSettings) {
        console.log('Setting TELESCOPE_TRACK_MODE.TRACK_SIDEREAL');
        await this.astrometry.indiManager.setParam(ct, this.getScope(), 'TELESCOPE_TRACK_MODE', {'TRACK_SIDEREAL': 'On'});
        
        // Start tracking. This one stays busy ... No way to distinguish from a failed pending order !
        console.log('Setting TELESCOPE_TRACK_STATE');
        await this.astrometry.indiManager.activate(ct, this.getScope(), 'TELESCOPE_TRACK_STATE', 'TRACK_ON');

        // Set speed for slew
        console.log('Setting TELESCOPE_SLEW_RATE');
        await this.astrometry.indiManager.setParam(ct, this.getScope(), 'TELESCOPE_SLEW_RATE', {
            [settings.slewRate]: 'On'
        });
    }

    raDistance(a:number, b:number) {
        let result = (b - a) % 24;
        if (result > 12) {
            result -= 24;
        }
        if (result < -12) {
            result += 24;
        }
        console.log('ra distance is ', result);
        return result;
    }
    // Stop at 1°
    private epsilon: number = 1/15;

    async slew(ct: CancellationToken, settings:PolarAlignSettings, targetRa:number) {
        // Read RA
        const startRa = this.readRa();
        const initialDistance = this.raDistance(startRa, targetRa);
        if (Math.abs(initialDistance) < this.epsilon) {
            return;
        }
        let bestDistance = initialDistance;

        const direction = bestDistance > 0 ? 'MOTION_EAST' : 'MOTION_WEST';
        console.log('Starting motion');
        const motion = createTask<void>(ct, async (task)=> {
            await this.astrometry.indiManager.pulseParam(task.cancellation, this.getScope(), 'TELESCOPE_MOTION_WE', direction);
        });
        const pilot = createTask<void>(ct, async (task)=> {
            console.log('Pilot task started');
            while(true) {
                await Sleep(task.cancellation, 100);
                const newRa = this.readRa();
                const newDistance = this.raDistance(newRa, targetRa);
                console.log('Pilot task: ', newDistance);
                if (Math.abs(newDistance) < this.epsilon) {
                    break;
                }
                if (Math.abs(newDistance) > Math.abs(bestDistance)) {
                    // FIXME: throw error if distance is big
                    break;
                }
                if (Math.sign(newDistance) != Math.sign(bestDistance)) {
                    // FIXME: throw error if distance is big
                    break;
                }
                bestDistance = newDistance;
            }
            console.log('Pilot task finished');
        });
        // FIXME: if parent token was interrupted...
        let error = undefined;
        try {
            motion.catch((e)=>pilot.cancel());
            pilot.catch((e)=>motion.cancel());
            await pilot;
            console.log('Done with pilot task');
        } catch(e) {
            console.log('Catched pilot task catched', e);
            if (!(e instanceof CancellationToken.CancellationError)) {
                console.warn("Pulse pilot failed", e);
                error = e;
            }
        } finally {
            try {
                console.log('Stoping motion task');
                motion.cancel();
                await motion
                console.log('Motion task done (?)');
            } catch(e) {
                console.log('Motion task catched', e);
                if (!(e instanceof CancellationToken.CancellationError)) {
                    console.warn("Motion failed", e);
                    error = e;
                }
            }
        };
        if (error) {
            throw error;
        }
        ct.throwIfCancelled();
    }

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
                // Set scope track to off
                // take a shoot and resolve
                // compute the actual arc
                // for(i = min to max) 
                //      slew to i
                //      shoot
                //      start astrometry
                // then do a regression to compute error
                // TODO: put the real code for polar alignment...
                // TODO: deep copy parameters on the first pass
                try {
                    if (!this.astrometry.camera.currentStatus.selectedDevice) {
                        throw new Error("No camera selected");
                    }
                    await this.prepareScope(token, this.astrometry.currentStatus.settings.polarAlign);
                    await this.slew(token, this.astrometry.currentStatus.settings.polarAlign, 6);

                    // Settle before shoot
                    await sleep(token, 500);

                    const photo = await this.astrometry.camera.doShoot(token, this.astrometry.camera.currentStatus.selectedDevice!, (s)=> ({...s, type: 'LIGHT', prefix: 'polar-align'}));
                    console.log('done photo', photo);

                    // FIXME: put in a resumable task queue
                    try {
                        const astrometry = await this.astrometry.compute(token, {image: photo.path, forceWide: false});
                        // FIXME: convert to JNOW & put in queue
                        console.log('done astrom', astrometry);
                    } catch(e) {
                        if (e instanceof CancellationToken.CancellationError) {
                            throw e;
                        }
                        // FIXME: should return failed result 
                        console.log('Ignoring astrometry problem', e);
                    }

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