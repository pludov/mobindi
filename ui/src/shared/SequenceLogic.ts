import { Sequence, SequenceStep, SequenceStepStatus, SequenceStepParameters, SequenceValueMonitoringPerClassSettings, SequenceValueMonitoringPerClassStatus} from '@bo/BackOfficeStatus';

import { hasKey } from './Obj';

export type SequenceWithStatus = {
    step: SequenceStep;
    status: SequenceStepStatus;
};


export type SequenceSize = {
    currentImageClass?: string;
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

    // Assume a foreach is ongoing. null if nothing left to iterate
    getNextForeach(current: SequenceWithStatus) : string | null {
        for(let i = 0; i < current.step.foreach!.list.length; ++i) {
            const foreachId = current.step.foreach!.list[i];
            if (!Object.prototype.hasOwnProperty.call(current.status.finishedForeach, foreachId)) {
                return foreachId;
            }
        }
        return null;
    }

    // Get the finished foreach count, ignored removed foreach
    getEffectiveFinishedForeachCount(current: SequenceWithStatus): number {
        if (!current.step.foreach) {
            return 0;
        }
        if (!current.status.finishedForeach) {
            return 0;
        }

        let ret = 0;
        for(const foreachId of current.step.foreach.list) {
            if (Object.prototype.hasOwnProperty.call(current.status.finishedForeach, foreachId)) {
                ret++;
            }
        }
        return ret;
    }

    finish(current: SequenceWithStatus){
        // We can't decide here if foreach is the last...
        if (current.status.currentForeach !== null) {
            if (!current.status.finishedForeach) {
                current.status.finishedForeach = {};
            }
            current.status.finishedForeach[current.status.currentForeach] = true;
            
            const newForeach = this.getNextForeach(current);
            if (newForeach !== null) {
                current.status.currentForeach = newForeach;
                current.status.execUuid = this.uuid();
                return;
            }
        }
        current.status.finishedLoopCount = (current.status.finishedLoopCount || 0) + 1;

        // Set those here to allow proper display of paused sequence.
        current.status.finishedForeach = (current.step.foreach ? {} : null);
        current.status.currentForeach = (current.step.foreach ? this.getNextForeach(current) : null);
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
            finishedForeach: null,
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

    getProgress(stepStack: Array<SequenceWithStatus>, start?: number):Progress {
        if (start === undefined) {
            start = 0;
        }

        const v = stepStack[start];
        const loopCount = Math.max(v.step.repeat || 0, 1);
        const doneCount = v.status.finishedLoopCount;

        const foreachCount = Math.max(v.step.foreach?.list.length || 0, 1);
        const doneForeachCount = this.getEffectiveFinishedForeachCount(v);

        if (start === stepStack.length -1) {
            const expValue = this.calcExposure(stepStack.map(e=>e.step));
            return {
                totalCount: foreachCount * loopCount,
                imagePosition: doneCount * foreachCount + doneForeachCount,
                totalTime: foreachCount * loopCount * expValue,
                timeSpent: (doneCount * foreachCount + doneForeachCount) * expValue,
            };
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

        // account for foreach
        ret.imagePosition += ret.totalCount * doneForeachCount;
        ret.timeSpent += ret.totalTime * doneForeachCount;
        ret.totalCount *= foreachCount;
        ret.totalTime *= foreachCount;

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

            for(let incLoop = 0; (!this.statusDone(current)) && incLoop <= 1; ++incLoop) {

                for(let incForeach = 0; incForeach <= 1; ++incForeach) {

                    if (current.step.foreach) {
                        if (current.status.finishedForeach === null) {
                            current.status.finishedForeach = {};
                        }

                        if (current.status.currentForeach === null
                                || Object.prototype.hasOwnProperty.call(current.status.finishedForeach, current.status.currentForeach))
                        {
                            let newForeach = this.getNextForeach(current);
                            if (current.status.currentForeach !== null) {
                                current.status.execUuid = this.uuid();
                            }
                            current.status.currentForeach = newForeach;
                            if (newForeach === null) {
                                // Foreach is exhausted
                                break;
                            }
                        }
                    }

                    if (current.step.childs) {
                        // step has childs. Must go down
                        // Iterate all childs. If they are all done, the exec is finished

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

                    } else {
                        return true;
                    }

                    // Arrive here when current foreach is exhausted (child became so)
                    if (incForeach === 0) {
                        if (current.status.currentForeach !== null) {
                            if (!current.status.finishedForeach) {
                                current.status.finishedForeach = {};
                            }
                            current.status.finishedForeach[current.status.currentForeach] = true;
                        }
                    }
                }

                if (incLoop === 0) {
                    current.status.finishedLoopCount = (current.status.finishedLoopCount || 0) + 1;
                    // Looping is still possible. Start a new foreach loop
                    current.status.currentForeach = current.step.foreach ? current.step.foreach.list[0] : null;
                    current.status.finishedForeach = current.step.foreach ? {} : null;
                    current.status.execUuid = this.uuid();
                }
            }

            // Pop the entry
            stepStack.splice(stepStack.length - 1, 1);
            return false;
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

        // Handle dither once here
        if (ret.dithering && ret.dithering.once) {
            if (step.status.finishedLoopCount) {
                delete ret.dithering;
            }
        }

        if (ret.focuser && ret.focuser.once) {
            if (step.status.finishedLoopCount) {
                delete ret.focuser;
            }
        }

        return ret;
    }

    getParameters(steps: Array<SequenceWithStatus>):SequenceStepParameters {
        const param:SequenceStepParameters = {};
        let ditheringStepId: number|undefined;
        let focuserStepId: number|undefined;

        for(let i = 0; i < steps.length; ++i) {
            const o = steps[i];
            const stepParams = this.getStepParameters(o);
            if (Object.prototype.hasOwnProperty.call(stepParams, 'dithering')) {
                ditheringStepId = i;
            }
            if (Object.prototype.hasOwnProperty.call(stepParams, 'focuser')) {
                focuserStepId = i;
            }
            Object.assign(param, stepParams);
        }

        if (ditheringStepId !== undefined && param.dithering?.once) {
            // We want loopCount == 0 + activeChild = firstChild + activeForeach = first
            let first = true;
            for(let i = ditheringStepId; i < steps.length; ++i) {
                const o = steps[i];
                if (o.status.finishedLoopCount) {
                    first = false;
                    break;
                }

                if (o.step.childs && o.status.activeChild !== o.step.childs.list[0]) {
                    first = false;
                    break;
                }

                if (o.step.foreach && o.status.currentForeach !== null && o.status.currentForeach !== o.step.foreach.list[0]) {
                    first = false;
                    break;
                }

            }
            if (!first) {
                delete param.dithering;
            }
        }

        if (focuserStepId !== undefined && param.focuser?.once) {
            // We want loopCount == 0 + activeChild = firstChild + activeForeach = first
            let first = true;
            for(let i = focuserStepId; i < steps.length; ++i) {
                const o = steps[i];
                if (o.status.finishedLoopCount) {
                    first = false;
                    break;
                }

                if (o.step.childs && o.status.activeChild !== o.step.childs.list[0]) {
                    first = false;
                    break;
                }

                if (o.step.foreach && o.status.currentForeach !== null && o.status.currentForeach !== o.step.foreach.list[0]) {
                    first = false;
                    break;
                }

            }
            if (!first) {
                delete param.focuser;
            }
        }


        return param;

    }

    /** Iterate over all actual exposure of the sequence */
    scanParameters(cb: (param: SequenceStepParameters, count: number)=>(void)) {
        const scanStepParameters = (
                cur: SequenceStepParameters,
                iteration:number,
                step: SequenceStep)=>
        {
            const {foreach, childs, repeat, ...ret} = {...step};

            const scanNode=()=>{
                cur = {...cur, ...ret};
                if (childs && childs.list.length) {
                    for(const uid of childs.list) {
                        scanStepParameters(cur, iteration * (repeat||1), childs.byuuid[uid]);
                    }
                } else {
                    cb(cur, iteration * (repeat || 1));
                }
            }

            if (foreach) {
                cur={...cur};
                const p : keyof SequenceStepParameters = foreach.param;
                console.log('Iterating ', foreach);
                for(const foreachUid of foreach.list) {
                    cur[p] = foreach.byuuid[foreachUid][p] as any;
                    scanNode();
                }
            } else {

                scanNode();
            }
        }

        scanStepParameters({}, 1, this.sequence.root);
    }


    static emptyMonitoringClassSettings: SequenceValueMonitoringPerClassSettings = {
    };

    static emptyMonitoringClassStatus:SequenceValueMonitoringPerClassStatus = {
        lastValue: null,
        lastValueTime: null,

        learnedValue: null,
        learnedCount: 0,
        learningReady: false,

        currentValue: null,
        currentCount: 0,

        maxAllowedValue: null,
    };

};

