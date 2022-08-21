import CancellationToken from 'cancellationtoken';
import Log from './Log';
import Wizard from "./Wizard";

import Sleep from './Sleep';
import { ShootResult } from './shared/BackOfficeAPI';
import SkyProjection from './SkyAlgorithms/SkyProjection';


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
        this.wizardStatus.meridianFlip!.shootRunning = true;
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
                                prefix: `meridian-flip-${this.sessionStartTimeStamp}-${frameid}-${frametype}-ISO8601`
                            })
            );
            photoTime = (photoTime + Date.now()) / 2;
            logger.info('done photo', {frametype, frameid, photo, photoTime});
            return { photo, photoTime };
        } finally {
            this.wizardStatus.meridianFlip!.shootRunning = false;
        }
    }
    
    // Solve plate in JNOW
    solve = async(token: CancellationToken, photo: ShootResult, photoTime: number) => {
        const wizardReport = this.wizardStatus.meridianFlip!;
        wizardReport.astrometryRunning = true;
        try {
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
    
            return {ra: ranow, dec: decnow};
        } finally {
            wizardReport.astrometryRunning = false;
        }
    }


    static getPierSide(geoCoords: {lat: number, long: number},
                raDecNow: {ra: number, dec:number},
                epoch: number)
    {

    }

    start = async ()=> {
        this.wizardStatus.title = "Meridian flip";

        this.wizardStatus.meridianFlip = {
            status: "initialConfirm",
            scopeMoving: false,
            shootRunning: false,
            astrometryRunning: false,
        }

        const wizardReport = this.wizardStatus.meridianFlip!;

        // TODO : si la monture a une target pier side, TARGETPIERSIDE,
        // proposer le switch avant le passage au meridien
        // (c'est que pour eqmod en fait)
        //    { name: 'PIER_EAST', value: 'On' }
        //    { name: 'CLEAR', value: 'On' }
        //    celui là semble avoir fait l'affaire : { affectations: [ { name: 'ALIGNLISTCLEAR', value: 'On' } ] }


        logger.info("Meridian flip wizard started");
        await this.waitNext(wizardReport!.status === "initialConfirm" ? "Start >>" : "Resume");
        if (!this.sessionStartTimeStamp) {
            this.sessionStartTimeStamp = new Date().toISOString().replace(/\.\d+|[-:]/g,'');
        }
        wizardReport!.status = "acquireInitialPosition";
        const {token, cancel} = CancellationToken.create();        
        this.setInterruptor(cancel);
        
        const {photo, photoTime} = await this.shoot(token, 1, "reference");
        const astrometry = await this.solve(token, photo, photoTime);

        this.astrometry.doGoto(token, this.getScope(), astrometry);

        wizardReport!.status = "done";
        this.setPaused(true);
        logger.info("Meridian flip wizard done");




        // During initial confirmation, display
        //  * current mount pier side, 
        //  * time left before need to switch
        //  * check mount is tracking

        // * suspend sequence (if any)
        // * suspend PHD
        
        // * take a shoot
        // * solve the shoot, record target position

        // * do a goto with pier side as specified
        // RETRY:
        // * clear sync data
        // * take a shoot
        // * solve the shoot,
        // * issue a sync, verify the sync
        // * do a goto with pier side as specified
        // * if delta was over tolerance, goto RETRY

        // * resume PHD (loop, search star, guide, wait for guiding)
        // * resume sequence if any
    }
}