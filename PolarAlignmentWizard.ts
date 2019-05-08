import CancellationToken from 'cancellationtoken';
import Wizard from "./Wizard";

import sleep from "./Sleep";
import { PolarAlignSettings, PolarAlignAxisResult } from './shared/BackOfficeStatus';
import Sleep from './Sleep';
import { createTask } from './Task';
import { default as SkyProjection, Map360, Map180 } from './SkyAlgorithms/SkyProjection';
import * as PlaneFinder from './SkyAlgorithms/PlaneFinder';
import { SucceededAstrometryResult } from './shared/ProcessorTypes';

export type MountShift = {
            tooHigh: number;
            tooEast: number;
};

export default class PolarAlignmentWizard extends Wizard {
    sessionStartTimeStamp : string = "";

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

    static raDistance(a:number, b:number) {
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
        const initialDistance = PolarAlignmentWizard.raDistance(startRa, targetRa);
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
                const newDistance = PolarAlignmentWizard.raDistance(newRa, targetRa);
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
                && (SkyProjection.lstRelRaDecToAltAz({relRaDeg:rangeDeg + step, dec : raDecNow.dec}, geoCoords).alt >= Math.max(settings.minAltitude,5))
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

    // Return coords of the axis in deg rel to zenith coords.
    static findMountAxis(path:Array<{relRaDeg: number, dec:number}>):{relRaDeg: number, dec:number}
    {
        const points = path.map(e=>SkyProjection.convertRaDecToEQ3D([e.relRaDeg, e.dec]));
        const equation = PlaneFinder.bestFit(points);
        if (equation === null) {
            throw new Error("Not enough points");
        }
        // We take the first vector, which is the normal of the plane, supposed to be the axis of the mount
        const axisRelRaDeg = SkyProjection.convertEQ3DToRaDec(equation);
        return {relRaDeg: axisRelRaDeg[0], dec: axisRelRaDeg[1]};
    }

    static computeAxis(mountAxis: {relRaDeg: number, dec:number}, geoCoords: {lat:number, long:number}): PolarAlignAxisResult {

        // FIXME: south ?
        const altAzRes = SkyProjection.lstRelRaDecToAltAz(mountAxis, geoCoords);

        return {
            ...mountAxis,
            tooEast: SkyProjection.raDegDiff(altAzRes.az, 0),
            tooHigh: SkyProjection.raDegDiff(altAzRes.alt, geoCoords.lat),
            distance: SkyProjection.getDegreeDistance([0, 90], [mountAxis.relRaDeg, mountAxis.dec])
        }
    }

    static centerFromAstrometry(astrometry: SucceededAstrometryResult, photoTime: number) {
        const skyProjection = SkyProjection.fromAstrometry(astrometry);
        const [ra2000, dec2000] = skyProjection.pixToRaDec([astrometry.width / 2, astrometry.height / 2]);
        // compute JNOW center for last image.
        const raDecDegNow = SkyProjection.raDecEpochFromJ2000([ra2000, dec2000], photoTime);

        return raDecDegNow;
    }

    public static mountMock?:MountShift = undefined;
    
    static mockRaDecDeg(raDecDegNow:number[], geoCoords: {lat:number, long:number}, photoTime: number) {
        if (PolarAlignmentWizard.mountMock) {
            const mocked = PolarAlignmentWizard.applyMountShift(raDecDegNow, geoCoords, photoTime, PolarAlignmentWizard.mountMock);
            raDecDegNow[0] = mocked[0];
            raDecDegNow[1] = mocked[1];
        }
    }

    static applyMountShift(raDecDegNow:number[], geoCoords: {lat:number, long:number}, photoTime: number, mountShift: MountShift) {
        const zenithRa = SkyProjection.getLocalSideralTime(photoTime! / 1000, geoCoords.long);
        console.log('input = ', raDecDegNow);
        let relRaDec = {
            relRaDeg: Map180(raDecDegNow[0] - 15 * zenithRa),
            dec: raDecDegNow[1],
        };
        console.log('relRaDec = ', relRaDec);
        // Adjust for testing purpose
        let altAz = SkyProjection.lstRelRaDecToAltAz(relRaDec, geoCoords);
        console.log('altaz = ', altAz);
        let xyz = SkyProjection.convertAltAzToALTAZ3D(altAz);
        xyz = SkyProjection.rotate(xyz, SkyProjection.rotationsALTAZ3D.toEast, -mountShift.tooEast);
        xyz = SkyProjection.rotate(xyz, SkyProjection.rotationsALTAZ3D.toSouth, mountShift.tooHigh);
        altAz = SkyProjection.convertALTAZ3DToAltAz(xyz);
        console.log('altaz = ', altAz);
        relRaDec = SkyProjection.altAzToLstRelRaDec(altAz, geoCoords);
        console.log('relRaDec = ', relRaDec);
        const output = [ Map360(zenithRa * 15 + relRaDec.relRaDeg), relRaDec.dec ];
        console.log('output = ', output);
        return output;
    }

    shoot = async (token: CancellationToken, frameid: number, frametype:string)=> {
        let photoTime = Date.now();
        this.wizardStatus.polarAlignment!.shootRunning = true;
        try {
            const photo = await this.astrometry.camera.doShoot(
                            token,
                            this.astrometry.camera.currentStatus.selectedDevice!,
                            (s)=> ({
                                ...s,
                                type: 'LIGHT',
                                prefix: `polar-align-${this.sessionStartTimeStamp}-${frameid}-${frametype}-ISO8601`
                            })
            );
            photoTime = (photoTime + Date.now()) / 2;
            console.log('done photo', photo);
            return { photo, photoTime };
        } finally {
            this.wizardStatus.polarAlignment!.shootRunning = false;
        }
    }

    updateDistance = (refFrame: {raDeg:number, dec:number}, lastFrame: {raDeg:number, dec:number}, geoCoords: {lat:number, long:number}, photoTime: number)=> {
        const zenithRaDeg = 15 * SkyProjection.getLocalSideralTime(photoTime / 1000, geoCoords.long);

        const refAltAz = SkyProjection.lstRelRaDecToAltAz({relRaDeg: Map360(refFrame.raDeg - zenithRaDeg), dec: refFrame.dec}, geoCoords);
        const lastAltAz = SkyProjection.lstRelRaDecToAltAz({relRaDeg: Map360(lastFrame.raDeg - zenithRaDeg), dec: lastFrame.dec}, geoCoords);

        const movedEast = SkyProjection.raDegDiff(lastAltAz.az, refAltAz.az);
        const movedHigh = SkyProjection.raDegDiff(lastAltAz.alt, refAltAz.alt);

        this.wizardStatus.polarAlignment!.tooHigh -= movedHigh;
        this.wizardStatus.polarAlignment!.tooEast -= movedEast;
        this.wizardStatus.polarAlignment!.distance = SkyProjection.getDegreeDistance(
                            [0, geoCoords.lat],
                            [this.wizardStatus.polarAlignment!.tooEast, geoCoords.lat + this.wizardStatus.polarAlignment!.tooHigh]);
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
            tooHigh: 0,
            tooEast: 0,
            distance: 0,
            adjustError: null,
            adjusting: null,
            relFrame: null,
            fatalError: null,
        }

        const wizardReport = this.wizardStatus.polarAlignment!;

        // RA relative to zenith
        let status: undefined | {start : number, end: number, stepSize: number, stepId: number, maxStepId: number};
        let shootId = 0;
        while(true) {
            await this.waitNext(wizardReport!.status === "initialConfirm" ? "Start >>" : "Resume");
            wizardReport!.status = "running";
            if (!this.sessionStartTimeStamp) {
                this.sessionStartTimeStamp = new Date().toISOString().replace(/\.\d+|[-:]/g,'');
            }
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

                            const raRange = PolarAlignmentWizard.computeRaRange(
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

                        const { photo, photoTime } = await this.shoot(token, ++shootId, "sampling");
                        wizardReport.shootDone++;

                        // FIXME: put in a resumable task queue
                        try {
                            wizardReport.astrometryRunning = true;
                            const astrometry = await this.astrometry.compute(token, {image: photo.path, forceWide: false});
                            // FIXME: convert to JNOW & put in queue
                            console.log('done astrom', astrometry);
                            if (astrometry.found) {
                                wizardReport.astrometrySuccess++;
                                const geoCoords = this.readGeoCoords();
                                const raDecDegNow = PolarAlignmentWizard.centerFromAstrometry(astrometry, photoTime!);
                                PolarAlignmentWizard.mockRaDecDeg(raDecDegNow, geoCoords, photoTime!);

                                const stortableStepId = ("000000000000000" + status.stepId.toString(16)).substr(-16);

                                const zenithRa = SkyProjection.getLocalSideralTime(photoTime! / 1000, geoCoords.long);

                                wizardReport.data[stortableStepId] = {
                                    relRaDeg: 15 * PolarAlignmentWizard.raDistance(raDecDegNow[0] / 15, zenithRa),
                                    dec: raDecDegNow[1],
                                };
                            } else {
                                wizardReport.astrometryFailed++;
                            }
                        } catch(e) {
                            if (e instanceof CancellationToken.CancellationError) {
                                throw e;
                            }
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

                    // We are done. Compute the regression
                    console.log('Compute the regression for', JSON.stringify(wizardReport.data));
                    
                    const path = Object.keys(wizardReport.data).map(k=>wizardReport.data[k]);
                    const mountAxis = PolarAlignmentWizard.findMountAxis(path);
                    wizardReport.axis = PolarAlignmentWizard.computeAxis(mountAxis, this.readGeoCoords());

                    console.log('result is ', JSON.stringify(wizardReport.axis));
                    break;
                } finally {
                    this.setInterruptor(null);
                    this.setPaused(true);
                }

            } catch(e) {
                if (e instanceof CancellationToken.CancellationError) {
                    this.wizardStatus.polarAlignment!.status = "paused";
                } else {
                    this.wizardStatus.polarAlignment!.fatalError = e.message || "" + e;
                    throw e;
                }
            }
        }

        // Let the user review.
        this.wizardStatus.polarAlignment!.status = "done";
        await this.waitNext("Next >>");

        // We arrived here when user wants to adjust mount.
        // We have a ref point and a correction to perform
        // The tracking is on.
        // For each new photo, we compute the alt-az distance between
        //    (ra,dec) of the reference photo
        //    (ra,dec) of the photo
        this.wizardStatus.polarAlignment!.status = "adjusting";
        wizardReport.tooEast = wizardReport.axis!.tooEast;
        wizardReport.tooHigh = wizardReport.axis!.tooHigh;
        wizardReport.distance =  wizardReport.axis!.distance;
        wizardReport.adjustError = null;
        while(true) {
            wizardReport.adjusting = null;
            // Always go back to normal frame
            this.astrometry.currentStatus.settings.polarAlign.dyn_nextFrameIsReferenceFrame = false;

            await this.waitNext("Shoot");
            this.setPaused(false);
            const takeRefFrame = this.astrometry.currentStatus.settings.polarAlign.dyn_nextFrameIsReferenceFrame || !wizardReport.relFrame;
            wizardReport.adjusting = takeRefFrame ? "refframe" : "frame";
            wizardReport.adjustError = null;

            const {token, cancel} = CancellationToken.create();
            this.setInterruptor(cancel);
            try {
                // FIXME: better progress report
                const {photo, photoTime } = await this.shoot(token, ++shootId, takeRefFrame ? "adjustment" : "reference");

                const astrometry = await this.astrometry.compute(token, {image: photo.path, forceWide: false});
                console.log('done astrom', astrometry);
                if (astrometry.found) {
                    const geoCoords = this.readGeoCoords();
                    const raDecDegNow = PolarAlignmentWizard.centerFromAstrometry(astrometry, photoTime!);
                    PolarAlignmentWizard.mockRaDecDeg(raDecDegNow, geoCoords, photoTime!);

                    if (takeRefFrame) {
                        wizardReport.relFrame = {
                            raDeg: raDecDegNow[0],
                            dec: raDecDegNow[1],
                        };
                    } else {
                        this.updateDistance(wizardReport.relFrame!, {raDeg: raDecDegNow[0], dec: raDecDegNow[1]}, geoCoords, photoTime);
                        wizardReport.relFrame!.raDeg = raDecDegNow[0];
                        wizardReport.relFrame!.dec = raDecDegNow[1];
                    }
                } else {
                    throw new Error("Astrometry failed");
                }
            } catch(e) {
                if (!(e instanceof CancellationToken.CancellationError)) {
                    console.warn("failure", e);
                    wizardReport.adjustError = e.message || ''+e;
                    await this.waitNext("Resume");
                } else {
                    wizardReport.adjustError = "Interrupted";
                }
            }
        }

    }
}