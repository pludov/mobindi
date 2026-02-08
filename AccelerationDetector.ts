import Log from './Log';

const logger = Log.logger(__filename);

export class AccelerationDetector {
    maxSpeed: number|undefined;
    startSample: number;
    lastSample: number;
    accelPhaseSamples: number|undefined;
    lastTime: number;
    sampleCount: number;
    done: boolean;
    unit: string;
    startDelay: number;

    constructor(firstSample: number, unit: string) {
        this.unit = unit;
        this.lastSample = firstSample;
        this.startSample = firstSample;
        this.maxSpeed = undefined;
        this.accelPhaseSamples = undefined;
        this.sampleCount = 1;
        this.done = false;
        this.startDelay = 0;
        this.lastTime = 0;
    }

    addStep(newSample: number, duration: number) {
        if (this.maxSpeed === undefined && newSample == this.startSample) {
            this.startDelay = duration;
            this.lastTime = duration;
            return;
        }
        if (duration <= this.startDelay) {
            return;
        }
        // don't consider samples under 200ms. They will report wrong speed
        if (duration - this.lastTime  < 0.1) {
            logger.info(`Ignoring speed sample too close`);
            return;
        }

        const newSpeed = (newSample - this.lastSample) / (duration - this.lastTime);
        this.lastTime = duration;
        
        logger.info(`Instantaneous speed is ${newSpeed}`);
        if (this.done) {
            if (this.maxSpeed == undefined || Math.abs(this.maxSpeed) < Math.abs(newSpeed)) {
                this.maxSpeed = newSpeed;
            }
            this.lastSample = newSample;
            return;
        }
        if (this.maxSpeed === undefined || Math.abs(newSpeed) > Math.abs(this.maxSpeed *1.15)) {
            logger.info(`Still accelerating after ${(duration).toFixed(3)}s - ${this.sampleCount} samples for ${Math.abs(newSample - this.startSample)} ${this.unit}`);
        } else {
            logger.info(`Acceleration stopped after ${(duration).toFixed(3)}s - ${this.sampleCount} samples, over a distance of ${Math.abs(this.lastSample - this.startSample)}`);
            this.accelPhaseSamples = this.lastSample;
            this.done = true;
        }
        this.lastSample = newSample;
        if (this.maxSpeed == undefined || Math.abs(this.maxSpeed) < Math.abs(newSpeed)) {
            this.maxSpeed = newSpeed;
        }
    }

    getExpectedInertia() {
        if (this.accelPhaseSamples !== undefined) {
            return this.accelPhaseSamples;
        }
        // Not yet finished
        return this.lastSample - this.startSample;
    }

    getSpeed() {
        if (this.lastTime <= this.startDelay) {
            return 0;
        }
        return (this.lastSample - this.startSample) / (this.lastTime - this.startDelay);
    }
}
