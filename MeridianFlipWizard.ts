import CancellationToken from 'cancellationtoken';
import Log from './Log';
import Wizard from "./Wizard";

import Sleep from './Sleep';
import { ShootResult } from './shared/BackOfficeAPI';
import SkyProjection from './SkyAlgorithms/SkyProjection';
import { AstrometryResult } from './shared/ProcessorTypes';
import { MeridianFlipAcquireStep, MeridianFlipCorrectMountStep, MeridianFlipFlipMountStep, MeridianFlipGenericShootStep, MeridianFlipStep, MeridianFlipStepBase, MeridianFlipSyncStep } from './shared/BackOfficeStatus';


const logger = Log.logger(__filename);

type Step= {
    photo: ShootResult;
    photoTime: number;
    // FIXME: stats like number of stars, fwhm, ...

    // Full astrometry result
    astrometry?: AstrometryResult;
    // Center in JNOW coordinates
    center?: {ra: number, dec:number};
}

function radecToDeg(coords: {ra: number, dec:number})
{
    return [360 * coords.ra / 24, coords.dec];
}

export default class MeridianFlipWizard extends Wizard {
    sessionStartTimeStamp : string = "";

    getScope() {
        const scope = this.astrometry.currentStatus.selectedScope;
        if (!scope) {
            throw new Error("no scope selected");
        }
        return scope;
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
    

    shoot = async (token: CancellationToken, frameid: number, frametype:string)=> {
        let photoTime = Date.now();

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
                            prefix: `meridian-flip-${this.sessionStartTimeStamp}-${frameid}-${frametype}-ISO8601`
                        })
        );
        photoTime = (photoTime + Date.now()) / 2;
        logger.info('done photo', {frametype, frameid, photo, photoTime});
        return { photo, photoTime };
    }

    // Solve plate in JNOW (degree)
    solve = async(token: CancellationToken, photo: ShootResult, photoTime: number) => {
        const wizardReport = this.wizardStatus.meridianFlip!;

        const astrometry = await this.astrometry.compute(token, {image: photo.path, forceWide: true});

        logger.info('Done astrometry', {astrometry, photoTime});

        if (!astrometry.found) {
            throw new Error("Astrometry failed to solve image");
        }

        const skyProjection = SkyProjection.fromAstrometry(astrometry);
        // take the center of the image
        const center = [astrometry.width / 2, astrometry.height / 2];
        // Project to J2000
        const [ra2000, dec2000] = skyProjection.pixToRaDec(center);
        // compute JNOW center for last image.
        const [ranow, decnow] = SkyProjection.raDecEpochFromJ2000([ra2000, dec2000], Date.now());

        logger.info('Image center is', {ranow, decnow});
        return {center: {ra: ranow, dec: decnow}, astrometry};
    }

    stepHandlers: {[id: string]: (ct: CancellationToken, e:MeridianFlipStep) => Promise<void>} = {};

    addStep<StepType extends MeridianFlipStepBase> (
                            e: Omit<StepType, "status">,
                            stepHandler:(ct: CancellationToken, e: StepType) => Promise<void>,
                            after?:string)
    {
        const steps = this.wizardStatus.meridianFlip!.steps;

        const id = e.id;
        if (steps.list.indexOf(id) !== -1) {
            throw new Error("Duplicate step id: " + id);
        }

        steps.byuuid[id] = {...(e as any as Omit<MeridianFlipStep, "status">), status: "pending"} as MeridianFlipStep;
        if (after) {
            const index = steps.list.indexOf(after);
            steps.list.splice(index+1, 0, id);
        } else {
            steps.list.push(id);
        }

        this.stepHandlers[id] = stepHandler as any;
    }

    // Assume the current step is already done status
    findNextStep()
    {
        const wizardReport = this.wizardStatus.meridianFlip!;
        for(const id of wizardReport.steps.list) {
            const step = wizardReport.steps.byuuid[id];
            if (step.status === "pending" || step.status === "failed") {
                return step;
            }
        }
        return undefined;
    }

    findPreviousStep(ct: MeridianFlipStepBase, kinds: Array<string>)
    {
        const steps = this.wizardStatus.meridianFlip!.steps;

        const ctid = steps.list.indexOf(ct.id);
        if (ctid === -1) throw new Error("Step not found: " + ct.id);
        for(let i = ctid - 1; i >= 0; --i) {
            const id = steps.list[i];
            const s:MeridianFlipStep = steps.byuuid[id];

            if (kinds.indexOf(s.kind) !== -1) {
                return s;
            }
        }
        return undefined;
    }

    // Run a step. Return true if it's possible to go to the next step
    runStep= async (step: MeridianFlipStep) => {
        const wizardReport = this.wizardStatus.meridianFlip!;
        wizardReport.activeStep = step.id;

        // FIXME: a specific token is to be used for each operation. Cancelling should not stop the wizard (only suspend the current operation)
        // And the wizard should be able to restart accordingly
        const {token, cancel} = CancellationToken.create();
        this.setInterruptor(cancel);
        try {
            logger.info(`Meridian flip step ${step.id} - ${step.title} starting`);
            await this.stepHandlers[step.id](token, step);

            step.status = "done";
            logger.info(`Meridian flip step ${step.id} - ${step.title} done`);
            return true;
        } catch(e) {
            if (e instanceof CancellationToken.CancellationError) {
                logger.info(`Meridian flip step ${step.id} - ${step.title} paused`);
                return false;
            }
            logger.warn(`Meridian flip step ${step.id} - ${step.title} failed`, e);
            step.status = "failed";
            return false;
        } finally {
            this.setInterruptor(null);
        }
    }

    acquirePosition=async (ct : CancellationToken, imageType: string, status: MeridianFlipStepBase & MeridianFlipGenericShootStep)=>{
        status.exposing = true;
        let shoot;
        try {
            shoot = await this.shoot(ct, 1, "reference");
            status.photo = shoot.photo.path;
            status.photoTime = shoot.photoTime;
        } finally {
            status.exposing = false;
        }

        let solved;
        status.resolving = true;
        try {
            solved = await this.solve(ct, shoot.photo, shoot.photoTime);
            status.center = solved.center;
        } finally {
            status.resolving = false;
        }
    }

    acquireInitialPosition = async(ct : CancellationToken, status: MeridianFlipAcquireStep)=>{
        await this.acquirePosition(ct, "reference", status);
        this.wizardStatus.meridianFlip!.targetPosition = status.center;
    }

    flipMountPosition=async (ct : CancellationToken, status: MeridianFlipFlipMountStep)=>{
        if (!this.wizardStatus.meridianFlip!.targetPosition!) {
            throw new Error("No target position recorded");
        }

        await this.astrometry.doGoto(ct, this.getScope(), this.wizardStatus.meridianFlip!.targetPosition!);
        // FIXME: Check pier side is correct after goto (actually flipped)
    }

    acquireMountPosition=async (ct : CancellationToken, status: MeridianFlipSyncStep)=>{
        await this.acquirePosition(ct, "verification", status);
    }

    correctMountPosition=async (ct : CancellationToken, status: MeridianFlipCorrectMountStep)=>{
        const targetPosition = this.wizardStatus.meridianFlip!.targetPosition;
        if (!targetPosition) {
            throw new Error("No target position recorded");
        }

        const previousSync = this.findPreviousStep(status, ["sync"]) as MeridianFlipSyncStep | undefined;
        if (!previousSync || previousSync.status !== "done") {
            throw new Error(`Previous acquisition step ${previousSync?.status || "missing"}`);
        }
        // FIXME: Clear the calibration if this is the first correction attempt

        logger.info(`Syncing mount`, previousSync.center);

        // Emit sync
        await this.astrometry.doSync(ct, this.getScope(), previousSync.center!);

        const distance = SkyProjection.getDegreeDistance(radecToDeg(previousSync.center!), radecToDeg(targetPosition));
        logger.info(`Mount imprecision after ${status.retry} correction is ${distance}°`);
        // Do a goto : FIXME: thresold for change
        if (status.retry < 1) {
            await this.astrometry.doGoto(ct, this.getScope(), targetPosition);

            const acquireStepId = `acquire-flipped-position-${status.retry + 1}`
            this.addStep(
                {
                    id: acquireStepId,
                    title: "Acquire flipped position",
                    kind: "sync",
                    retry: status.retry + 1,
                },
                this.acquireMountPosition,
                status.id
            );
            this.addStep(
                {
                    id: `correct-${status.retry + 1}`,
                    title: "Correct scope position (sync/goto)",
                    kind: "correct",
                    retry: status.retry + 1,
                },
                this.correctMountPosition,
                acquireStepId
            );
        }
    }

    verifyFlippedPosition=async (ct : CancellationToken, status: MeridianFlipSyncStep)=>{
        await this.acquirePosition(ct, "verification", status);
        // FIXME: expose delta to client
    }

    declareSteps = ()=> {
        this.addStep({
            id: "acquire-initial-position",
            title: "Acquire initial position",
            kind: "presync",
        }, this.acquireInitialPosition);
        this.addStep({
            id: "flip",
            title: "Flip mount position",
            kind: "flip",
        }, this.flipMountPosition);
        this.addStep({
            id: "acquire-flipped-position",
            title: "Acquire flipped position",
            kind: "sync",
            retry: 0,
        }, this.acquireMountPosition);
        this.addStep({
            id: "correct",
            title: "Correct scope position (sync/goto)",
            kind: "correct",
            retry: 0,
        }, this.correctMountPosition);
    }

    start = async ()=> {
        this.wizardStatus.title = "Meridian flip";

        this.wizardStatus.meridianFlip = {
            activeStep: null,

            steps: {
                list: [],
                byuuid: {},
            }
        };
        this.declareSteps();

        // The UI must give a list of operation with their status, the ability to skip it
        // The UI will look like:
        //   - * check conditions (skip/retry)
        //   - * suspend Sequence (skip/retry)
        //   - * suspend Guiding (skip/retry)
        //   - * acquire current position (skip/retry)
        //   - * GOTO (skip / retry)
        //   - * sync on resulting position (skip / retry)
        //   - * correction (skip / retry)
        //   - * resume Guiding (skip / retry)
        //   - * resume Sequence (skip / retry)


        // TODO : si la monture a une target pier side, TARGETPIERSIDE,
        // proposer le switch avant le passage au meridien
        // (c'est que pour eqmod en fait)
        //    { name: 'PIER_EAST', value: 'On' }
        //    { name: 'CLEAR', value: 'On' }
        //    celui là semble avoir fait l'affaire : { affectations: [ { name: 'ALIGNLISTCLEAR', value: 'On' } ] }


        logger.info("Meridian flip wizard started");

        while(true) {

            const step = this.findNextStep();
            if (step == undefined) {
                this.setPaused(true);
                logger.info("Meridian flip wizard done");

                break;
            }
            await this.waitNext(step.title + " >>");

            if (!this.sessionStartTimeStamp) {
                this.sessionStartTimeStamp = new Date().toISOString().replace(/\.\d+|[-:]/g,'');
            }


            await this.runStep(step);
        }

    }
}