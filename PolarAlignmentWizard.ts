import CancellationToken from 'cancellationtoken';
import Log from './Log';
import Wizard from "./Wizard";

import sleep from "./Sleep";
import { PolarAlignSettings, PolarAlignAxisResult, PolarAlignPositionMessage } from './shared/BackOfficeStatus';
import Sleep from './Sleep';
import { createTask } from './Task';
import { default as SkyProjection, Map360, Map180 } from './SkyAlgorithms/SkyProjection';
import * as PolarAlignment from './SkyAlgorithms/PolarAlignment';
import * as PlaneFinder from './SkyAlgorithms/PlaneFinder';
import { SucceededAstrometryResult } from './shared/ProcessorTypes';
import ScopeTrackCounter from './ScopeTrackCounter';
import Astrometry, { defaultAxis } from './Astrometry';
import { SynchronizerTriggerCallback } from './shared/JsonProxy';
import * as Quaternion from 'quaternion';
import { AccelerationDetector } from './AccelerationDetector';

const logger = Log.logger(__filename);

export type MountShift = {
            tooHigh: number;
            tooEast: number;
};


class ImpreciseDirectionChecker {
    astrometry: Astrometry;
    wizard: PolarAlignmentWizard;
    listener: SynchronizerTriggerCallback|undefined;
    constructor(wizard: PolarAlignmentWizard) {
        this.astrometry = wizard.astrometry;
        this.wizard = wizard;
    }

    getWarn = ()  : null|PolarAlignPositionMessage => {
        const raDecScope = this.wizard.readScopePos();
        // FIXME: in degrees please
        raDecScope.ra *= 15;

        const geoCoords = this.wizard.readGeoCoords();
        const zenithRa = SkyProjection.getLocalSideralTime(new Date().getTime(), geoCoords.long);
        const scopeAltAz = SkyProjection.lstRelRaDecToAltAz({relRaDeg: raDecScope.ra - zenithRa, dec: raDecScope.dec}, geoCoords);

        // Get the axe
        let axe = this.wizard.wizardStatus.polarAlignment!.axis!;
        let e = PolarAlignment.evalPolarAlignmentPosition(scopeAltAz, axe);
        logger.info('Current position evaluated', e);

        for(let {degree, title} of [{degree: e.alt_norm, title:  'Altitude'}, {degree: e.az_norm, title: 'Azimuth'}]) {   
            if (degree < PolarAlignment.minimumAxeRatio) {
                return {
                    message: `The region pointed by the scope has poor scaling on the ${title} axis ${(degree * 100).toFixed(2)}%`,
                    warning: true,
                }
            }
        }
        const eval_angle = e.eval_angle;
        if (eval_angle > PolarAlignment.orthogonalityThreshold[0]) {
            return {
                message: `The current position is ok for good precision. The base angle is ${eval_angle.toFixed(1)}°`,
                warning: false,
            };
        } else if (eval_angle > PolarAlignment.orthogonalityThreshold[1]) {
            return {
                message: `The region pointed by the scope will give poor precision. The base angle is too small (${eval_angle.toFixed(3)}°)`,
                warning: true,
            }
        } else {
            return {
                message: `The region pointed by the scope is not suitable. The base angle is too small (${eval_angle.toFixed(3)}°)`,
                warning: true,
            }
        }
    }

    check = ()=> {
        try {
            this.wizard.wizardStatus.polarAlignment!.adjustPositionMessage = this.getWarn();
            this.wizard.wizardStatus.polarAlignment!.adjustPositionError = null;
        } catch(e) {
            this.wizard.wizardStatus.polarAlignment!.adjustPositionMessage = null;
            this.wizard.wizardStatus.polarAlignment!.adjustPositionError = (e as any).message || "" + e;
        }
    }

    start() {
        this.check();
        this.listener = this.astrometry.appStateManager.addSynchronizer(
                [
                    [
                        [
                        'astrometry', 'selectedScope'
                        ],
                        [
                            'indiManager', 'deviceTree', null,
                                [
                                    [ 'EQUATORIAL_EOD_COORD', 'childs', null, '$_' ],
                                    [ 'GEOGRAPHIC_COORD', 'childs', null, '$_' ]
                                ]
                        ],
                    ]
                ],
                this.check,
                false
        );
    }

    stop() {
        this.astrometry.appStateManager.removeSynchronizer(this.listener!);
        this.wizard.wizardStatus.polarAlignment!.adjustPositionMessage = null;
        this.wizard.wizardStatus.polarAlignment!.adjustPositionError = null;
    }
}

export default class PolarAlignmentWizard extends Wizard {
    sessionStartTimeStamp : string = "";

    getScope() {
        const scope = this.astrometry.currentStatus.selectedScope;
        if (!scope) {
            throw new Error("no scope selected");
        }
        return scope;
    }

    readRa():{ra: number, rev:number} {
        // Inserts a sleep to ensure data is up to date ?
        const vec = this.astrometry.indiManager.getValidConnection().getDevice(this.getScope()).getVector("EQUATORIAL_EOD_COORD");
        const ra = parseFloat(vec.getPropertyValue("RA"));
        const rev = vec.getRev()
        logger.debug('current ra', {ra, rev});
        return {ra, rev};
    }

    // Read jnow scope position
    readScopePos = () => {
        // Inserts a sleep to ensure data is up to date ?
        const vec = this.astrometry.indiManager.getValidConnection().getDevice(this.getScope()).getVector("EQUATORIAL_EOD_COORD");
        const ra = parseFloat(vec.getPropertyValue("RA"));
        const dec = parseFloat(vec.getPropertyValue("DEC"));
        
        logger.debug('current scope pos (jnow)', {ra, dec});
        return {ra, dec};
    }

    
    readGeoCoords = () => {
        // Inserts a sleep to ensure data is up to date ?
        const vec = this.astrometry.indiManager.getValidConnection().getDevice(this.getScope()).getVector("GEOGRAPHIC_COORD");
        const lat = parseFloat(vec.getPropertyValue("LAT"));
        const long = parseFloat(vec.getPropertyValue("LONG"));
        logger.debug('current geo coords', {lat, long});
        return {lat, long};
    }

    async prepareScope(ct: CancellationToken, settings:PolarAlignSettings) {
        logger.info('Setting TELESCOPE_TRACK_MODE.TRACK_SIDEREAL');
        await this.astrometry.indiManager.setParam(ct, this.getScope(), 'TELESCOPE_TRACK_MODE', {'TRACK_SIDEREAL': 'On'});
        
        // Start tracking. This one stays busy ... No way to distinguish from a failed pending order !
        logger.info('Setting TELESCOPE_TRACK_STATE');
        await this.astrometry.indiManager.activate(ct, this.getScope(), 'TELESCOPE_TRACK_STATE', 'TRACK_ON');

        // Set speed for slew
        logger.info('Setting TELESCOPE_SLEW_RATE');
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
        return result;
    }

    // Stop at 1°
    private epsilon: number = 0.2 * 1/15;

    // Return error in hours, in range [-12h, 12h]
    async slew(ct: CancellationToken, settings:PolarAlignSettings, targetRa:number) : Promise<number> {
        // Read RA
        const {ra: startRa, rev: startRaRev}  = this.readRa();
        let lastRaRev = startRaRev;
        const initialDistance = PolarAlignmentWizard.raDistance(startRa, targetRa);
        if (Math.abs(initialDistance) < this.epsilon) {
            return initialDistance;
        }
        let bestDistance = initialDistance;
        let finalDistance = initialDistance;
        // Count the acceleration phase.
        // The acceleration phase last while move gets bigger

        const direction = bestDistance > 0 ? 'MOTION_EAST' : 'MOTION_WEST';
        logger.info('Starting ra slew', {targetRa, direction});
        let motionTerminatedAt:number|undefined = undefined;
        const motion = createTask<void>(ct, async (task)=> {
            try {
                await this.astrometry.indiManager.pulseParam(task.cancellation, this.getScope(), 'TELESCOPE_MOTION_WE', direction);
            } finally {
                motionTerminatedAt = Date.now();
            }
        });
        const pilot = createTask<void>(ct, async (task)=> {
            logger.debug('Pilot task started');
            const accelerationDetector = new AccelerationDetector(initialDistance, 'h');
            const startTime = Date.now();
            let lastTime = startTime;

            let lastRa = startRa;
            let lastMoveRa = startRa;
            let stopped = false;
            let stopTimeLimit : number|undefined = undefined;

            let lastMoveTime = startTime;

            const idleDelay = 1000 * settings.slewDelay;
            while(true) {
                await Sleep(task.cancellation, 10);
                const {ra: newRa, rev: newRaRev} = this.readRa();
                const now = Date.now();

                if (!stopped && stopTimeLimit && stopTimeLimit <= now) {
                    logger.info(`Stopping slew at computed prediction time + ${((now-stopTimeLimit)/1000).toFixed(3)}s`);
                    motion.cancel();
                    stopped = true;
                }

                if (newRaRev == lastRaRev) {
                    // No need to rush, unless we stopped and a long time elapsed
                    if (stopped && motionTerminatedAt && (now - Math.max(lastTime, motionTerminatedAt) > idleDelay)) {
                        logger.info(`Scope is idle for ${idleDelay}s. Telescope seems stopped.`);
                        break;
                    }
                    continue;
                }
                logger.info(`New sample`, {newRa, lastRa});
                lastRa = newRa;
                lastRaRev = newRaRev;
                lastTime = now;
                if (Math.abs(PolarAlignmentWizard.raDistance(newRa, lastMoveRa)) > (2 / (15*60*60))) {
                    lastMoveTime = now;
                    lastMoveRa = newRa;
                }

                // Checking if it's time to stop

                const newDistance = PolarAlignmentWizard.raDistance(newRa, targetRa);

                accelerationDetector.addStep(newDistance, (now - startTime) / 1000);

                logger.debug('Distance updated', {newRa, newDistance});
                if ((Math.abs(newDistance) < 0.2 * this.epsilon)
                    /*|| (Math.abs(newDistance) > Math.abs(bestDistance))*/
                    || (Math.sign(newDistance) != Math.sign(bestDistance)))
                {
                    if (!stopped) {
                        logger.info('Stopping scope because it reaches the target position');
                        motion.cancel();
                        stopped = true;
                    }
                } else {
                    bestDistance = newDistance;
                }

                if (!stopped) {
                    // The speed is from the initial error to 0.
                    const dynamicCorrection = -1 * settings.slewInertiaFactor * accelerationDetector.getExpectedInertia();
                    const staticCorrection = -1 * settings.slewStopDuration * accelerationDetector.getSpeed();
                    const newDistanceWithInertia = PolarAlignmentWizard.raDistance(newRa
                            + dynamicCorrection
                            + staticCorrection,
                            targetRa);
                    logger.info(`estimated stop position`, {
                        newRa,
                        dynamicCorrection,
                        staticCorrection,
                        targetRa
                    });

                    if (Math.sign(newDistanceWithInertia) != Math.sign(initialDistance)) {
                        logger.info('Stopping scope early to account stop inertia');
                        motion.cancel();
                        stopped = true;
                    } else {
                        if (Math.abs(accelerationDetector.getSpeed()) > 0) {
                            const currentSpeed = Math.abs(accelerationDetector.getSpeed());
                            const timeLeftToSlew = Math.abs(newDistanceWithInertia / currentSpeed);
                            logger.info(`Estimated time left: ${timeLeftToSlew.toFixed(3)}s at speed: ${currentSpeed.toFixed(3)}h/s`);
                            stopTimeLimit = now + 1000 * timeLeftToSlew;
                        } else {
                            logger.info('Not able to compute theorical time left');
                            stopTimeLimit = undefined;
                        }

                    }
                } else {
                    if (motionTerminatedAt && Math.max(lastMoveTime, motionTerminatedAt) > idleDelay) {
                        logger.info(`Scope didn't move much for ${idleDelay}s after stopping motion. Telescope seems stopped.`);
                        break;
                    }
                }
            }

            finalDistance = PolarAlignmentWizard.raDistance(lastRa, targetRa);
            if (Math.abs(finalDistance) < this.epsilon) {
                logger.info(`Scope stopped at h distance: ${finalDistance}`);
            } else {
                logger.warn(`Scope stopped at large h distance: ${finalDistance}`);
            }
            logger.info('Pilot task finished');
        });
        // FIXME: if parent token was interrupted...
        let error = undefined;
        try {
            motion.catch((e)=> {
                if (!(e instanceof CancellationToken.CancellationError)) {
                    pilot.cancel();
                }
            });
            pilot.catch((e)=>motion.cancel());
            await pilot;
            logger.info('Done with pilot task');
        } catch(e) {
            logger.debug('Catched pilot task catched', e);
            if (!(e instanceof CancellationToken.CancellationError)) {
                logger.error("Pulse pilot failed", e);
                error = e;
            } else {
                logger.debug("Pilot task interrupted");
            }
        } finally {
            try {
                logger.info('Stoping motion task');
                motion.cancel();
                await motion
                logger.warn('Motion task done (?)');
            } catch(e) {
                logger.debug('Motion task catched', e);
                if (!(e instanceof CancellationToken.CancellationError)) {
                    logger.error("Motion failed", e);
                    error = e;
                }
            }
        };
        if (error) {
            throw error;
        }
        ct.throwIfCancelled();
        return finalDistance;
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

    static computeAxis(altAzMountAxis: {alt: number, az:number}, geoCoords: {lat:number, long:number}): PolarAlignAxisResult {

        return {
            ...altAzMountAxis,
            tooEast: SkyProjection.raDegDiff(altAzMountAxis.az, 0),
            tooHigh: SkyProjection.raDegDiff(altAzMountAxis.alt, geoCoords.lat),
            distance: SkyProjection.getDegreeDistance([0, geoCoords.lat], [altAzMountAxis.az, altAzMountAxis.alt])
        }
    }

    static mockRaDecDegNow(raDecDegNow: number[], msTime: number, geoCoords: {lat:number, long:number}, mountMock?:MountShift): number[]
    {
        if (mountMock === undefined) {
            return raDecDegNow;
        }
        const quat = SkyProjection.getALTAZ3DMountCorrectionQuaternion([geoCoords.lat, 0], [geoCoords.lat + mountMock.tooHigh, mountMock.tooEast]);
        let zenithRa = SkyProjection.getLocalSideralTime(msTime, geoCoords.long);
        let relRaDec = {dec: raDecDegNow[1], relRaDeg: Map180(raDecDegNow[0] - zenithRa)};
        let altAz = SkyProjection.lstRelRaDecToAltAz(relRaDec, geoCoords);
        let ptALTAZEQ3D = SkyProjection.convertAltAzToALTAZ3D(altAz);
        ptALTAZEQ3D = quat.rotateVector(ptALTAZEQ3D);
        altAz = SkyProjection.convertALTAZ3DToAltAz(ptALTAZEQ3D);
        relRaDec = SkyProjection.altAzToLstRelRaDec(altAz, geoCoords);
        return [Map360(relRaDec.relRaDeg + zenithRa), relRaDec.dec];
    }

    static mockALTAZ3D(msTime: number, geoCoords: {lat:number, long:number}, mountMock?:MountShift): Quaternion
    {
        if (mountMock === undefined) {
            return Quaternion.ONE;
        }
        const quat = SkyProjection.getALTAZ3DMountCorrectionQuaternion([geoCoords.lat, 0], [geoCoords.lat + mountMock.tooHigh, mountMock.tooEast]);
        return quat;
    }

    static centerFromAstrometry(astrometry: SucceededAstrometryResult, photoTime: number, geoCoords: {lat:number, long:number}) : {raDecDegNow: number[], quatALTAZ3D: Quaternion}{
        const skyProjection = SkyProjection.fromAstrometry(astrometry);
        const [ra2000, dec2000] = skyProjection.pixToRaDec([astrometry.width / 2, astrometry.height / 2]);
        // compute JNOW center for last image.
        let raDecDegNow = SkyProjection.raDecEpochFromJ2000([ra2000, dec2000], photoTime);
        raDecDegNow = PolarAlignmentWizard.mockRaDecDegNow(raDecDegNow, photoTime, geoCoords, PolarAlignmentWizard.mountMock);

        let quatALTAZ3D = skyProjection.getIMG3DToEQ3DQuaternion([astrometry.width / 2, astrometry.height / 2])

        quatALTAZ3D = SkyProjection.getEQ3DToALTAZ3DQuaternion(photoTime, geoCoords).mul(quatALTAZ3D);

        quatALTAZ3D = PolarAlignmentWizard.mockALTAZ3D(photoTime, geoCoords, PolarAlignmentWizard.mountMock).mul(quatALTAZ3D);

        // FIXME: Cancel refraction here as well ?

        return {raDecDegNow, quatALTAZ3D };
    }

    public static mountMock?:MountShift = undefined;
    
    shoot = async (token: CancellationToken, frameid: number, frametype:string)=> {
        let photoTime = Date.now();
        this.wizardStatus.polarAlignment!.shootRunning = true;
        try {
            const imagingSetupId = this.astrometry.currentStatus.currentImagingSetup;
            if (imagingSetupId === null) {
                throw new Error("No imaging setup selected");
            }
            const photo = await this.astrometry.camera.doShoot(
                            token,
                            imagingSetupId,
                            (s)=> ({
                                ...s,
                                type: 'LIGHT',
                                prefix: `polar-align-${this.sessionStartTimeStamp}-${frameid}-${frametype}-ISO8601`
                            })
            );
            photoTime = (photoTime + Date.now()) / 2;
            logger.info('done photo', {frametype, frameid, photo, photoTime});
            return { photo, photoTime };
        } finally {
            this.wizardStatus.polarAlignment!.shootRunning = false;
        }
    }

    static updateAxis = (previousAxe: {alt:number, az:number}, refALTAZ3D: Quaternion, quatALTAZ3D: Quaternion, trackedMs:number):{alt:number, az:number}=> {
        const previousAxeALTAZ3D = SkyProjection.convertAltAzToALTAZ3D(previousAxe);

        const tracking = Quaternion.fromAxisAngle(previousAxeALTAZ3D, -trackedMs * 2 * Math.PI / SkyProjection.SIDERAL_DAY_MS);
        // Rotate previous Axe
        const trackedRefALTAZ3D = tracking.mul(refALTAZ3D);

        // We could divied quat/corrected.
        // This is more stable but less precise since field rotation is very imprecise compared to astrometry resolution
        // Compute alt-az of center of correctedRefAltAz3D (just rotateVector origin)
        const trackedRefALTAZ3Dvec = trackedRefALTAZ3D.rotateVector([0,0,1]);
        
        // We can derive a 'alt' vector and a 'az' vector by under/over correcting in alt/az.
        // We project theses vectors on the plane defined by quatALTAZ3D
        let { alt_az_target_base , evaluationProjection } = PolarAlignment.getMountMovementEvaluationBase(previousAxe, trackedRefALTAZ3Dvec);
        logger.info('Axe evaluated', previousAxe);
        
        // Check that the vectors of the base are orthogonal
        // We compute the cross product of the two vectors
        // If the cross product is null, the vectors are orthogonal
        let base_angle_cose = PolarAlignment.getAngleCos2D(alt_az_target_base[0], alt_az_target_base[1]);
        logger.info('Base angle:', 180 * Math.acos(base_angle_cose) / Math.PI);
        logger.info('Evaluation target base :', alt_az_target_base);
        logger.info('Reference frame projects at :', evaluationProjection.rotateVector(trackedRefALTAZ3Dvec));
        
        
        const correctedALTAZ3Dvec =quatALTAZ3D.rotateVector([0,0,1]);
        logger.info('correctedALTAZ3Dvec', correctedALTAZ3Dvec);
        
        // project corrected in that base
        let corrected_in_evaluation_base = evaluationProjection.rotateVector(correctedALTAZ3Dvec);
        
        logger.info('Sample frame projects at :', corrected_in_evaluation_base);

        // Cannot use orthogonal projection because the base is not orthogonal
        const corrected = corrected_in_evaluation_base;
        const target_base = alt_az_target_base;
        // Compute displacment in degree
        let alt_az_move_from_ref = {
            alt: (corrected[1]*target_base[1][0]-corrected[0]*target_base[1][1])/(target_base[0][1]*target_base[1][0]-target_base[0][0]*target_base[1][1]),
            az: -(corrected[1]*target_base[0][0]-corrected[0]*target_base[0][1])/(target_base[0][1]*target_base[1][0]-target_base[0][0]*target_base[1][1]),
        };

        logger.info('Displacement from reference is ', alt_az_move_from_ref);

        
        return {alt: previousAxe.alt + alt_az_move_from_ref.alt, az: previousAxe.az + alt_az_move_from_ref.az};
    }


    static dataFromSamplingResult(astrometry: SucceededAstrometryResult, photoTime: number, geoCoords: {lat: number, long:number}) {
        const { raDecDegNow } = PolarAlignmentWizard.centerFromAstrometry(astrometry, photoTime!, geoCoords);
        const zenithRa = SkyProjection.getLocalSideralTime(photoTime!, geoCoords.long);
        const rawResult = {
            relRaDeg: Map180(raDecDegNow[0] - zenithRa),
            dec: raDecDegNow[1],
        };
        return SkyProjection.lstRelRaDecCancelRefraction(rawResult, geoCoords);
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
            startRelRa: null,
            endRelRa: null,
            maxStepId: 0,
            stepId: 0,
            adjustError: null,
            adjusting: null,
            fatalError: null,
            hasRefFrame: false,
            adjustPositionError: null,
            adjustPositionMessage: null,
        }

        const wizardReport = this.wizardStatus.polarAlignment!;

        // RA relative to zenith
        let status: undefined | {start : number, end: number, stepSize: number, stepId: number, maxStepId: number};
        let shootId = 0;
        let scopeTrackCounter: ScopeTrackCounter|undefined;
        try {
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
                    let slewDistances: Array<number> = [];
                    try {
                        while(true) {
                            const geoCoords = this.readGeoCoords();
                            const imagingSetupId = this.astrometry.currentStatus.currentImagingSetup;
                            if (!imagingSetupId) {
                                throw new Error("No imaging setup selected");
                            }
                            
                            if (status === undefined) {
                                const settings = this.astrometry.currentStatus.settings.polarAlign;
                                if (settings.sampleCount < 3) {
                                    throw new Error("Need at least 3 samples");
                                }

                                const raRange = PolarAlignment.computeRaRange(
                                                        geoCoords,
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
                            wizardReport.startRelRa = status.start;
                            wizardReport.endRelRa = status.end;

                            logger.info('Polar alignment step', {stepId: status.stepId, start: status.start, end: status.end, stepSize: status.stepSize});
                            await this.prepareScope(token, this.astrometry.currentStatus.settings.polarAlign);
                            
                            const relRa = status.start + status.stepSize * status.stepId;
                            const targetRa = SkyProjection.getLocalSideralTime(new Date().getTime(), geoCoords.long) / 15 + relRa;

                            try {
                                wizardReport.scopeMoving = true;
                                let perf = await this.slew(token, this.astrometry.currentStatus.settings.polarAlign, targetRa);
                                slewDistances.push(perf);
                                // Settle before shoot
                                await sleep(token, 200);
                            } finally {
                                wizardReport.scopeMoving = false;
                            }
                            logger.info('Done slew', {targetRa, effectiveRa: this.readScopePos().ra});
                            if (!this.astrometry.currentStatus.settings.polarAlign?.skipPhotos) {

                                const frameType = "sampling";
                                const { photo, photoTime } = await this.shoot(token, ++shootId, frameType);
                                wizardReport.shootDone++;

                                // FIXME: put in a resumable task queue
                                try {
                                    wizardReport.astrometryRunning = true;
                                    const astrometry = await this.astrometry.compute(token, {imageUuid: photo.uuid, forceWide: false});
                                    // FIXME: convert to JNOW & put in queue
                                    logger.info('Done astrometry', {astrometry, photoTime, geoCoords, frameType});
                                    if (astrometry.found) {
                                        wizardReport.astrometrySuccess++;
                                        const stortableStepId = ("000000000000000" + status.stepId.toString(16)).substr(-16);

                                        wizardReport.data[stortableStepId] = PolarAlignmentWizard.dataFromSamplingResult(astrometry, photoTime!, geoCoords);
                                    } else {
                                        wizardReport.astrometryFailed++;
                                    }
                                } catch(e) {
                                    if (e instanceof CancellationToken.CancellationError) {
                                        throw e;
                                    }
                                    logger.warn('Ignoring astrometry problem', e);
                                    wizardReport.astrometryFailed++;
                                } finally {
                                    wizardReport.astrometryRunning = false;
                                }
                            }
                            if (status.stepId >= status.maxStepId) {
                                break;
                            }
                            status.stepId++;
                        }

                        // Search errors above epsilons
                        let outliers = 0;
                        let rms = 0;
                        let max = 0;
                        for(const k of slewDistances) {
                            if (Math.abs(k) > 2 * this.epsilon) {
                                outliers++;
                            }
                            if (Math.abs(k) > max) {
                                max = Math.abs(k);
                            }
                            rms +=  k*k;
                        }
                        if (slewDistances.length > 0) {
                            rms /= slewDistances.length;
                        }
                        rms = Math.sqrt(rms);

                        let slewStatusMessage= `${outliers} outliers out of ${slewDistances.length}. Max=${(15 * max).toFixed(2)}° RMS=${(15 * rms).toFixed(2)}°`;

                        // For skip photo, terminate here
                        if (this.astrometry.currentStatus.settings.polarAlign?.skipPhotos) {
                            this.wizardStatus.polarAlignment!.status = "done";
                            this.wizardStatus.polarAlignment!.fatalError = `Debug done. ${slewStatusMessage}`;
                            return;
                        }
                        logger.info(`Done slewing: ${slewStatusMessage}`, {slewDistances});

                        // We are done. Compute the regression
                        logger.debug('Compute the regression', {data: wizardReport.data});

                        const path = Object.keys(wizardReport.data).map(k=>wizardReport.data[k]);
                        const mountAxis = PolarAlignmentWizard.findMountAxis(path);
                        const geoCoords = this.readGeoCoords();
                        const altAzMountAxis = SkyProjection.lstRelRaDecToAltAz(mountAxis, geoCoords);
                        wizardReport.axis = PolarAlignmentWizard.computeAxis(altAzMountAxis, geoCoords);

                        logger.info('regression result', wizardReport.axis);
                        break;
                    } finally {
                        this.setInterruptor(null);
                        this.setPaused(true);
                    }

                } catch(e) {
                    if (e instanceof CancellationToken.CancellationError) {
                        this.wizardStatus.polarAlignment!.status = "paused";
                    } else {
                        this.wizardStatus.polarAlignment!.fatalError = (e as any).message || "" + e;
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
            wizardReport.adjustError = null;

            let badAxisAtRefAltAz = {alt: wizardReport.axis!.alt, az: wizardReport.axis!.az};
            let badAxisLastAltAz = badAxisAtRefAltAz;
            let refALTAZ3D : Quaternion | null = null;
            while(true) {
                wizardReport.adjusting = null;
                // Always go back to normal frame
                this.astrometry.currentStatus.settings.polarAlign.dyn_nextFrameKind = "adjust" as any;
                const posChecker = new ImpreciseDirectionChecker(this);
                posChecker.start();
                try {
                    await this.waitNext("Shoot");
                } finally {
                    posChecker.stop();
                }
                this.setPaused(false);
                const nextFrameKind = this.astrometry.currentStatus.settings.polarAlign.dyn_nextFrameKind;
                const takeRefFrame = (nextFrameKind === "refframe") || (refALTAZ3D === null);
                let axisCalibrationRequest : undefined| { axis :"alt"|"az", turn: number};
                if (takeRefFrame || (nextFrameKind === "frame") || nextFrameKind === undefined) {
                    axisCalibrationRequest = undefined;
                } else {
                    wizardReport.adjusting = nextFrameKind;
                    
                    if (nextFrameKind === "cal_alt" || nextFrameKind === "cal_az") {
                        let turn = this.astrometry.currentStatus.settings.polarAlign.dyn_nextFrameCalibrationTurn;
                        if (turn === undefined || turn === null) {
                            wizardReport.adjustError = "No turn value defined";
                            await this.waitNext("Resume");
                            continue;
                        }
                        if (Math.abs(turn) < 1 / 3600) {
                            wizardReport.adjustError = "Turn value too small";
                            await this.waitNext("Resume");
                            continue;
                        }
                        axisCalibrationRequest = {
                            axis: nextFrameKind === "cal_alt" ? "alt" : "az",
                            turn
                        }
                    }
                }

                wizardReport.adjusting = takeRefFrame ? "refframe" : (nextFrameKind || "frame");
                wizardReport.adjustError = null;

                const {token, cancel} = CancellationToken.create();
                this.setInterruptor(cancel);
                let tempScopeTrackCounter;
                try {
                    if (takeRefFrame) {
                        wizardReport.hasRefFrame = false;
                        refALTAZ3D = null;
                        badAxisAtRefAltAz = badAxisLastAltAz;
                    }

                    const frameType = takeRefFrame ? "reference" : "adjustment";
                    // FIXME: better progress report
                    const {photo, photoTime } = await this.shoot(token, ++shootId, frameType);
                    let photoTrackSinceRef:number;
                    if (takeRefFrame) {
                        tempScopeTrackCounter = new ScopeTrackCounter(this.astrometry.indiManager, this.getScope());
                        tempScopeTrackCounter.start();
                        photoTrackSinceRef = 0;
                    } else {
                        photoTrackSinceRef = scopeTrackCounter!.getElapsed();
                    }
                    logger.info("Done photo", {takeRefFrame, photo, photoTime});

                    const astrometry = await this.astrometry.compute(token, {imageUuid: photo.uuid, forceWide: false});
                    if (astrometry.found) {
                        const geoCoords = this.readGeoCoords();
                        const { raDecDegNow, quatALTAZ3D } = PolarAlignmentWizard.centerFromAstrometry(astrometry, photoTime!, geoCoords);
                        logger.info('Done astrometry', {astrometry, photoTime, geoCoords, frameType, takeRefFrame});

                        if (takeRefFrame) {
                            refALTAZ3D = quatALTAZ3D;
                            wizardReport.hasRefFrame = true;

                            // Replace the tracker with this one.
                            if (scopeTrackCounter !== undefined) {
                                scopeTrackCounter.stop();
                            }
                            scopeTrackCounter = tempScopeTrackCounter;
                            tempScopeTrackCounter = undefined;

                        } else {
                            let prevAxis = {...wizardReport.axis};

                            badAxisLastAltAz = PolarAlignmentWizard.updateAxis(badAxisAtRefAltAz, refALTAZ3D!, quatALTAZ3D, photoTrackSinceRef);
                            wizardReport.axis = PolarAlignmentWizard.computeAxis(badAxisLastAltAz, geoCoords);

                            if (axisCalibrationRequest) {
                                let axis : "alt"|"az" = axisCalibrationRequest.axis;

                                const values = [prevAxis[axis], wizardReport.axis[axis]];
                                let turned = axisCalibrationRequest.turn;

                                // mountAxisTurnPerScrewTurn
                                const axisTurnPerMovedDegree = Map180(values[1] - values[0]) / turned;

                                logger.info("Calibrated axis", {axis, values, turned, axisTurnPerMovedDegree});

                                let polarAlignAxis = this.astrometry.currentStatus.settings.polarAlign[axis];
                                if (!polarAlignAxis) {
                                    this.astrometry.currentStatus.settings.polarAlign[axis] = {
                                        ...defaultAxis(),
                                        axisTurnPerMovedDegree: axisTurnPerMovedDegree,
                                    };
                                } else {
                                    polarAlignAxis.axisTurnPerMovedDegree = axisTurnPerMovedDegree;
                                }
                            }

                        }
                    } else {
                        throw new Error("Astrometry failed");
                    }
                } catch(e) {
                    if (!(e instanceof CancellationToken.CancellationError)) {
                        logger.error("failure", e);
                        wizardReport.adjustError = (e as any).message || ''+e;
                        await this.waitNext("Resume");
                    } else {
                        wizardReport.adjustError = "Interrupted";
                    }
                } finally {
                    if (tempScopeTrackCounter !== undefined) {
                        tempScopeTrackCounter.stop();
                        tempScopeTrackCounter = undefined;
                    }
                }
            }
        } finally {
            if (scopeTrackCounter !== undefined) {
                scopeTrackCounter.stop();
                scopeTrackCounter = undefined;
            }
        }
    }
}