import { CameraDeviceSettings, BackofficeStatus, SequenceStatus, Sequence, SequenceStep, SequenceStepStatus, SequenceStepParameters} from './shared/BackOfficeStatus';

import { hasKey } from './Obj';

export type SequenceWithStatus = {
    step: SequenceStep;
    status: SequenceStepStatus;
};


export type SequenceSize = {
    totalCount: number;
    totalTime: number;
}

export type Progress = {
    /** 0 based */
    imagePosition: number;
    timeSpent: number;
} & SequenceSize;



export class SequenceLogic {
    private readonly sequence: Sequence;
    private readonly uuid:()=>string;

    constructor(sequence: Sequence, uuid:()=>string) {
        this.sequence = sequence;
        this.uuid = uuid;
    }

    statusDone(current: SequenceWithStatus):boolean {
        if ((current.status.finishedLoopCount || 0) >= Math.max(current.step.repeat || 0, 1)) {
            return true;
        }
        return false;
    }

    finish(current: SequenceWithStatus){
        current.status.finishedLoopCount = (current.status.finishedLoopCount || 0) + 1;
        current.status.execUuid = this.uuid();
    }

    getExecution(stepUuid: string, parentExec?: SequenceStepStatus): SequenceStepStatus|null {
        if (Object.prototype.hasOwnProperty.call(this.sequence.stepStatus, stepUuid)) {
            const currentStatus = this.sequence.stepStatus[stepUuid];
            if (parentExec === undefined
                || currentStatus.parentExecUuid === parentExec.execUuid)
            {
                return currentStatus;
            }
        }
        return null;
    }

    getOrCreateExecution(stepUuid: string, parentExec?: SequenceStepStatus): SequenceStepStatus {
        const status = this.getExecution(stepUuid, parentExec);
        if (status !== null) {
            return status;
        }
        const sequence = this.sequence;
        const newStatus:SequenceStepStatus = {
            execUuid: this.uuid(),
            parentExecUuid: parentExec ? parentExec.execUuid : null,
            finishedLoopCount: 0,
            currentForeach: null,
        };
        sequence.stepStatus[stepUuid] = newStatus;
        // Read back
        return sequence.stepStatus[stepUuid];
    }

    calcExposure(step: SequenceStep[]): number {
        let exp: number = 0;
        for(const s of step) {
            if (s.exposure !== undefined) {
                exp = s.exposure;
            }
        }
        return exp;
    }

    totalCount(steps:SequenceStep[]):SequenceSize {
        const step = steps[steps.length - 1]
        const mult = Math.max(step.repeat || 1, 1);

        const size: SequenceSize = {
            totalCount: 0,
            totalTime: 0,
        };
        if (step.childs && step.childs.list.length) {
            for(const child of step.childs.list) {
                const childSize = this.totalCount(steps.concat([step.childs.byuuid[child]]));
                size.totalCount += childSize.totalCount;
                size.totalTime += childSize.totalTime;
            }
        } else {
            size.totalCount= 1;
            size.totalTime= this.calcExposure(steps);
        }

        size.totalCount *= mult;
        size.totalTime *= mult;
        return size;
    }

    getProgress(stepStack: Array<{step: SequenceStep, status: SequenceStepStatus}>, start?: number):Progress {
        if (start === undefined) {
            start = 0;
        }

        const v = stepStack[start];
        const loopCount = Math.max(v.step.repeat || 0, 1);
        const doneCount = v.status.finishedLoopCount;

        if (start === stepStack.length -1) {
            const expValue = this.calcExposure(stepStack.map(e=>e.step));
            return {
                totalCount: loopCount,
                imagePosition: doneCount,
                totalTime: loopCount * expValue,
                timeSpent: doneCount * expValue,
            }
        }

        let ret: Progress = {
            imagePosition: 0,
            totalCount: 0,
            timeSpent: 0,
            totalTime: 0,
        }

        // We have childs. Account in position until active child is viewed
        let activeChildFound : boolean = v.status.activeChild === undefined;
        for(const childUuid of v.step.childs!.list) {
            if (childUuid === v.status.activeChild) {
                const v = this.getProgress(stepStack, start + 1);
                ret.imagePosition += v.imagePosition;
                ret.timeSpent += v.timeSpent;
                ret.totalCount += v.totalCount;
                ret.totalTime += v.totalTime;

                activeChildFound = true;
            } else {
                const c = this.totalCount(stepStack.slice(0, start + 1).map(e=>e.step).concat([v.step.childs!.byuuid[childUuid]]));
                ret.totalCount += c.totalCount;
                ret.totalTime += c.totalTime;
                if (!activeChildFound) {
                    ret.imagePosition += c.totalCount;
                    ret.timeSpent += c.totalTime;
                }
            }
        }

        // account for repeat
        ret.imagePosition += ret.totalCount * doneCount;
        ret.timeSpent += ret.totalTime * doneCount;
        ret.totalCount *= loopCount;
        ret.totalTime *= loopCount;

        return ret;
    }

    // Ensure foreach is set according to definition
    getNextStep():Array<SequenceWithStatus>|undefined {
        const stepStack: Array<{step: SequenceStep, status: SequenceStepStatus}>= [];


        // Pop the head if false
        const enter= ()=>
        {
            const current = stepStack[stepStack.length - 1];
            if (current.step.childs) {
                // step has childs. Must go down
                // Iterate all childs. If they are all done, the exec is finished

                for(let inc = 0; (!this.statusDone(current)) && inc <= 1; ++inc) {
                    // Restart from activeChild
                    const childUuid = current.status.activeChild;
                    let toTry = childUuid
                                ? [childUuid, ...current.step.childs.list.filter(e=>e!==childUuid)]
                                : current.step.childs.list;

                    for(const childUid of toTry) {
                        stepStack.push({
                            step: current.step.childs.byuuid[childUid],
                            status: this.getOrCreateExecution(childUid, current.status)
                        });

                        if (enter()) {
                            current.status.activeChild = childUid;
                            return true;
                        }
                        if (current.status.activeChild !== undefined) {
                            delete current.status.activeChild;
                        }
                    }

                    if (inc == 0) {
                        // Nothing is possible. Start a new loop
                        this.finish(current);
                    }
                }
            } else {
                if (!this.statusDone(current)) {
                    return true;
                }
            }

            // Pop the entry
            stepStack.splice(stepStack.length - 1, 1);
        }

        stepStack.push({step: this.sequence.root, status: this.getOrCreateExecution("root")});
        if (!enter()) {
            return undefined;
        }
        return stepStack;
    }


    getStepParameters(step: {step: SequenceStep, status: SequenceStepStatus}):SequenceStepParameters
    {
        const {foreach, childs, repeat, ...ret} = {...step.step};

        if (foreach && step.status.currentForeach && hasKey(foreach.byuuid, step.status.currentForeach)) {
            const p : keyof SequenceStepParameters = foreach.param;
            ret[p] = foreach.byuuid[step.status.currentForeach][p] as any;
        }

        return ret;
    }

    getParameters(steps: Array<SequenceWithStatus>):SequenceStepParameters {
        // FIXME: not valid for dither once
        const param:SequenceStepParameters = {};
        for(const o of steps) {
            Object.assign(param, this.getStepParameters(o));
        }
        return param;

    }

};

