import CancellationToken from 'cancellationtoken';
import Wizard from "./Wizard";

import sleep from "./Sleep";
import { PolarAlignSettings } from './shared/BackOfficeStatus';
import Sleep from './Sleep';
import { createTask } from './Task';
import SkyProjection from './SkyAlgorithms/SkyProjection';

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

    // Read jnow scope position
    readScopePos = () => {
        // Inserts a sleep to ensure data is up to date ?
        const vec = this.astrometry.indiManager.getValidConnection().getDevice(this.getScope()).getVector("EQUATORIAL_EOD_COORD");
        const ra = parseFloat(vec.getPropertyValue("RA"));
        const dec = parseFloat(vec.getPropertyValue("DEC"));
        
        console.log('current scope pos', ra, dec);
        return {ra, dec};
    }

    readGeoCoords = () => {
        // Inserts a sleep to ensure data is up to date ?
        const vec = this.astrometry.indiManager.getValidConnection().getDevice(this.getScope()).getVector("GEOGRAPHIC_COORD");
        const lat = parseFloat(vec.getPropertyValue("LAT"));
        const long = parseFloat(vec.getPropertyValue("LONG"));
        console.log('current geo coords', lat, long);
        return {lat, long};
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
        console.log('Starting motion to targetRa to ' + targetRa);
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

    /**
     * geoCoords: position of the observer
     * raDecNow: supposed position of the scope
     * epoch: number
     * 
     * return {start, end}: rel to zenith RA range
     */
    static computeRaRange = (
                geoCoords: {lat:number, long:number},
                raDecNow: {ra: number, dec:number},
                epoch: number,
                settings : {
                    angle: number,          // Maximum RA angle from zenith (mount limit)
                    minAltitude: number,    // Don't descend under this alt
                }
    ) => {
        const zenithRa = SkyProjection.getLocalSideralTime(epoch, geoCoords.long);
        console.log('zenith ra is ', zenithRa);

        // Minimum RA step in °
        const step = 1;
        let rangeDeg = 0;
        while(  (rangeDeg + step <= settings.angle)
                && (rangeDeg+step <= 110)
                && (SkyProjection.lstRelRaDecToAltAz({lstRelRa:(rangeDeg + step)/ 15, dec : raDecNow.dec}, geoCoords).alt >= Math.max(settings.minAltitude,5))
                )
        {
            rangeDeg += step;
        }

        if (rangeDeg === 0) {
            throw new Error("Current pos is too low above the horizon. Move scope or raise min altitude");
        }
        console.log('rangeDeg is ', rangeDeg);
        const raRange = rangeDeg / 15;

        const startRelRa = SkyProjection.raDiff(
                                raDecNow.ra,
                                zenithRa
                                );

        if (Math.abs(startRelRa) > 6) {
            throw new Error("Star too low. Peek a star closer to its culmination");
        }

        let start: number, end:number;
        if (startRelRa < 0) {
            // -90° to 0
            start = -raRange;
            end = 0;
        } else {
            // 0 to 90°
            start = raRange;
            end = 0;
        }
        return {start, end};
    }

    start = async ()=> {
        this.wizardStatus.title = "Polar alignment";

        this.wizardStatus.polarAlignment = {
            status: "initialConfirm",
            data: {},
            astrometrySuccess: 0,
            astrometryFailed: 0,
            shootDone: 0,
            shootRunning: false,
            scopeMoving: false,
            astrometryRunning: false,
            maxStepId: 0,
            stepId: 0,
        }

        const wizardReport = this.wizardStatus.polarAlignment;

        // RA relative to zenith
        let status: undefined | {start : number, end: number, stepSize: number, stepId: number, maxStepId: number};
        while(true) {
            await this.waitNext();
            wizardReport!.status = "running";
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
                    while(true) {
                        if (!this.astrometry.camera.currentStatus.selectedDevice) {
                            throw new Error("No camera selected");
                        }
                        
                        if (status === undefined) {
                            const settings = this.astrometry.currentStatus.settings.polarAlign;
                            if (settings.sampleCount < 3) {
                                throw new Error("Need at least 3 samples");
                            }

                            const raRange = PolarAlignementWizard.computeRaRange(
                                                    this.readGeoCoords(),
                                                    this.readScopePos(),
                                                    new Date().getTime() / 1000,
                                                    settings);
                            status = {
                                ...raRange,
                                maxStepId: settings.sampleCount - 1,
                                stepSize: (raRange.end - raRange.start) / (settings.sampleCount - 1),
                                stepId: 0,
                            }
                        }
                        wizardReport.stepId = status.stepId;
                        wizardReport.maxStepId = status.maxStepId;

                        await this.prepareScope(token, this.astrometry.currentStatus.settings.polarAlign);
                        
                        const relRa = status.start + status.stepSize * status.stepId;
                        const targetRa = SkyProjection.getLocalSideralTime(new Date().getTime()/1000, this.readGeoCoords().long) + relRa;

                        try {
                            wizardReport.scopeMoving = true;
                            await this.slew(token, this.astrometry.currentStatus.settings.polarAlign, targetRa);
                            // Settle before shoot
                            await sleep(token, 500);
                        } finally {
                            wizardReport.scopeMoving = false;
                        }
                        console.log('Done slew to ' + targetRa + ' got ' + this.readScopePos().ra);

                        let photo;
                        wizardReport.shootRunning = true;
                        try {
                            photo = await this.astrometry.camera.doShoot(token, this.astrometry.camera.currentStatus.selectedDevice!, (s)=> ({...s, type: 'LIGHT', prefix: 'polar-align-ISO8601'}));
                            console.log('done photo', photo);
                            wizardReport.shootDone++;
                        } finally {
                            wizardReport.shootRunning = false;
                        }

                        // FIXME: put in a resumable task queue
                        try {
                            wizardReport.astrometryRunning = true;
                            const astrometry = await this.astrometry.compute(token, {image: photo.path, forceWide: false});
                            // FIXME: convert to JNOW & put in queue
                            console.log('done astrom', astrometry);
                            if (astrometry.found) {
                                wizardReport.astrometrySuccess++;
                                const raDecDegNow = SkyProjection.raDecEpochFromJ2000([astrometry.raCenter, astrometry.decCenter], Date.now());
                                const stortableStepId = ("000000000000000" + status.stepId.toString(16)).substr(-16);
                                wizardReport.data[stortableStepId] = {
                                    ra: raDecDegNow[0] / 15,
                                    dec: raDecDegNow[1],
                                };
                            } else {
                                wizardReport.astrometryFailed++;
                            }
                        } catch(e) {
                            if (e instanceof CancellationToken.CancellationError) {
                                throw e;
                            }
                            // FIXME: should return failed result 
                            console.log('Ignoring astrometry problem', e);
                            wizardReport.astrometryFailed++;
                        } finally {
                            wizardReport.astrometryRunning = false;
                        }
                        if (status.stepId >= status.maxStepId) {
                            break;
                        }
                        status.stepId++;
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