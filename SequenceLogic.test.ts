import "source-map-support/register";
import { expect, assert } from 'chai';

import { Sequence } from "./shared/BackOfficeStatus";
import { SequenceLogic } from "./SequenceLogic";

function uuidMock() {
    let v = 0;
    
    return ()=>{
        return (v++).toString(16).padStart(8, '0');
    }
}

describe("SequenceLogic", () => {
    it("Single step with repeat", () => {
        const sequence: Sequence = {
            status: "idle",
            progress: null,
            
            title: "Test sequence",
            camera: "camera_id",
            errorMessage: null,
            
            stepStatus: {},
            root: {
                exposure: 10,
                bin: 1,
                repeat: 2,
            },
            
            // uuids of images
            images: [],
        }
        
        const logic:SequenceLogic = new SequenceLogic(sequence, uuidMock());
        let nextStep = logic.getNextStep();
        
        // Check parameters are exactly one
        assert.deepEqual(nextStep, [
            {
                "status": {
                    "currentForeach": null,
                    "execUuid": "00000000",
                    "finishedLoopCount": 0,
                    "parentExecUuid": null,
                },
                "step": {
                    "bin": 1,
                    "exposure": 10,
                    "repeat": 2,
                }
            }
        ],
        "First status");
        
        logic.finish(nextStep![nextStep!.length - 1]);
        
        nextStep = logic.getNextStep();
        assert.deepEqual(nextStep, [
            {
                "status": {
                    "currentForeach": null,
                    "execUuid": "00000001",
                    "finishedLoopCount": 1,
                    "parentExecUuid": null,
                },
                "step": {
                    "bin": 1,
                    "exposure": 10,
                    "repeat": 2,
                }
            }
        ]
        , "Second status");
        
        logic.finish(nextStep![nextStep!.length - 1]);
        
        nextStep = logic.getNextStep();
        assert.deepEqual(nextStep, undefined);
    });
    
    
    
    it("repeat with two childs", () => {
        const sequence: Sequence = {
            status: "idle",
            progress: null,
            
            title: "Test sequence",
            camera: "camera_id",
            errorMessage: null,
            
            stepStatus: {},
            root: {
                exposure: 10,
                repeat: 2,
                childs: {
                    list: [ "aaaa", "bbbb" ],
                    byuuid: {
                        "aaaa": {
                            bin: 2
                        },
                        "bbbb": {
                            bin: 4
                        }
                    }
                }
            },
            
            // uuids of images
            images: [],
        }
        
        
        const logic:SequenceLogic = new SequenceLogic(sequence, uuidMock());
        let nextStep = logic.getNextStep();
        
        // Check parameters are exactly one
        assert.notStrictEqual(nextStep, undefined);
        assert.equal(nextStep!.length, 2);
        assert.deepEqual(nextStep!.map(e=>e.status),
        [
            {
                "currentForeach": null,
                "execUuid": "00000000",
                "finishedLoopCount": 0,
                "parentExecUuid": null,
                "activeChild": "aaaa",
            },
            {
                "currentForeach": null,
                "execUuid": "00000001",
                "finishedLoopCount": 0,
                "parentExecUuid": "00000000",
            }
        ]);
        assert.strictEqual(nextStep![1].step, sequence.root.childs!.byuuid.aaaa);
        
        logic.finish(nextStep![nextStep!.length - 1]);
        
        nextStep = logic.getNextStep();
        assert.notStrictEqual(nextStep, undefined);
        assert.equal(nextStep!.length, 2);
        assert.deepEqual(nextStep!.map(e=>e.status),
        [
            {
                "currentForeach": null,
                "execUuid": "00000000",
                "finishedLoopCount": 0,
                "parentExecUuid": null,
                "activeChild": "bbbb",
            },
            {
                "currentForeach": null,
                "execUuid": "00000003",
                "finishedLoopCount": 0,
                "parentExecUuid": "00000000",
            }
        ]);
        assert.strictEqual(nextStep![1].step, sequence.root.childs!.byuuid.bbbb);
        
        logic.finish(nextStep![nextStep!.length - 1]);
        
        nextStep = logic.getNextStep();
        assert.notStrictEqual(nextStep, undefined);
        assert.equal(nextStep!.length, 2);
        assert.deepEqual(nextStep!.map(e=>e.status),
        [
            {
                "currentForeach": null,
                "execUuid": "00000005",
                "finishedLoopCount": 1,
                "parentExecUuid": null,
                "activeChild": "aaaa",
            },
            {
                "currentForeach": null,
                "execUuid": "00000006",
                "finishedLoopCount": 0,
                "parentExecUuid": "00000005",
            }
        ]);
        assert.strictEqual(nextStep![1].step, sequence.root.childs!.byuuid.aaaa);
        
        logic.finish(nextStep![nextStep!.length - 1]);
        
        nextStep = logic.getNextStep();
        assert.notStrictEqual(nextStep, undefined);
        assert.equal(nextStep!.length, 2);
        assert.deepEqual(nextStep!.map(e=>e.status),
        [
            {
                "currentForeach": null,
                "execUuid": "00000005",
                "finishedLoopCount": 1,
                "parentExecUuid": null,
                "activeChild": "bbbb",
            },
            {
                "currentForeach": null,
                "execUuid": "00000008",
                "finishedLoopCount": 0,
                "parentExecUuid": "00000005",
            }
        ]);
        assert.strictEqual(nextStep![1].step, sequence.root.childs!.byuuid.bbbb);
        
        logic.finish(nextStep![nextStep!.length - 1]);
        
        nextStep = logic.getNextStep();
        assert.deepEqual(nextStep, undefined);
    });
});