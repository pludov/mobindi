import "source-map-support/register";
import { expect, assert } from 'chai';

import { Sequence, SequenceStepParameters } from "./BackOfficeStatus";
import { SequenceLogic } from "./SequenceLogic";

function uuidMock() {
    let v = 0;
    
    return ()=>{
        return (v++).toString(16).padStart(8, '0');
    }
}

const unusedFields = {
    fwhmMonitoring: {enabled: false, perClassStatus:{}, perClassSettings: {}, evaluationCount:5, evaluationPercentile: 0.5, learningCount:5, learningPercentile: 0.9},
    backgroundMonitoring:  {enabled: false, perClassStatus:{}, perClassSettings: {}, evaluationCount:5, evaluationPercentile: 0.5, learningCount:5, learningPercentile: 0.9},
    activityMonitoring: {enabled: false},
    astrometryRefImageUuid: null,
}


describe("SequenceLogic", () => {
    function singleStep() {
        const sequence: Sequence = {
            ...unusedFields,
            status: "idle",
            progress: null,
            
            title: "Test sequence",
            imagingSetup: "imaging_setup_id",
            errorMessage: null,
            
            stepStatus: {},
            root: {
                exposure: 10,
                bin: 1,
                repeat: 2,
            },
            
            // uuids of images
            images: [],
            imageStats: {},
        }
        return sequence;
    }

    function scanAccumulator() {
        const result: Array<{param: SequenceStepParameters, count: number}> = [];
        const cb : (param: SequenceStepParameters, count: number)=>(void) =
            (param, count) => {
                param = {...param};
                result.push({param, count});
            };

        return {cb, result};
    }

    it("Scan single step with repeat", () => {
        const sequence = singleStep();

        const logic:SequenceLogic = new SequenceLogic(sequence, uuidMock());
        const scan = scanAccumulator();
        logic.scanParameters(scan.cb);

        assert.deepStrictEqual(scan.result, [
            {
                param: {
                    exposure: 10,
                    bin: 1,
                },
                count: 2
            }
        ]);
    });

    it("Proceed single step with repeat", () => {
        const sequence = singleStep();

        const logic:SequenceLogic = new SequenceLogic(sequence, uuidMock());

        let nextStep = logic.getNextStep();
        let nextStepParams;

        // Check parameters are exactly one
        assert.deepStrictEqual(nextStep, [
            {
                "status": {
                    "currentForeach": null,
                    "finishedForeach": null,
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

        nextStepParams = logic.getParameters(nextStep!);
        assert.deepStrictEqual(nextStepParams, {
            bin: 1,
            exposure: 10,
        });

        logic.finish(nextStep![nextStep!.length - 1]);

        nextStep = logic.getNextStep();
        assert.deepStrictEqual(nextStep, [
            {
                "status": {
                    "currentForeach": null,
                    "finishedForeach": null,
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

        nextStepParams = logic.getParameters(nextStep!);
        assert.deepStrictEqual(nextStepParams, {
            bin: 1,
            exposure: 10,
        });

        logic.finish(nextStep![nextStep!.length - 1]);

        nextStep = logic.getNextStep();
        assert.deepStrictEqual(nextStep, undefined);
    });
    
    const repeatWithTwoChilds:()=>Sequence=()=> ({
        ...unusedFields,
        status: "idle",
        progress: null,
        
        title: "Test sequence",
        imagingSetup: "imaging_setup_id",
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
        imageStats: {},
    });

    it("scan repeat with two childs", () => {
        const sequence = repeatWithTwoChilds();

        const logic:SequenceLogic = new SequenceLogic(sequence, uuidMock());
        const scan = scanAccumulator();
        logic.scanParameters(scan.cb);

        assert.deepStrictEqual(scan.result, [
            {
                param: {
                    exposure: 10,
                    bin: 2,
                },
                count: 2
            },
            {
                param: {
                    exposure: 10,
                    bin: 4,
                },
                count: 2
            }
        ]);
    })

    it("proceed repeat with two childs", () => {
        const sequence = repeatWithTwoChilds();
        
        const logic:SequenceLogic = new SequenceLogic(sequence, uuidMock());
        let nextStep = logic.getNextStep();
        let nextStepParams;
        
        // Check parameters are exactly one
        assert.notStrictEqual(nextStep, undefined);
        assert.equal(nextStep!.length, 2);
        assert.deepStrictEqual(nextStep!.map(e=>e.status),
        [
            {
                "currentForeach": null,
                "finishedForeach": null,
                "execUuid": "00000000",
                "finishedLoopCount": 0,
                "parentExecUuid": null,
                "activeChild": "aaaa",
            },
            {
                "currentForeach": null,
                "finishedForeach": null,
                "execUuid": "00000001",
                "finishedLoopCount": 0,
                "parentExecUuid": "00000000",
            }
        ]);
        assert.strictEqual(nextStep![1].step, sequence.root.childs!.byuuid.aaaa);
        
        nextStepParams = logic.getParameters(nextStep!);

        assert.deepStrictEqual(nextStepParams, {
            exposure: 10,
            bin: 2,
        });

        logic.finish(nextStep![nextStep!.length - 1]);
        
        nextStep = logic.getNextStep();
        assert.notStrictEqual(nextStep, undefined);
        assert.equal(nextStep!.length, 2);
        assert.deepStrictEqual(nextStep!.map(e=>e.status),
        [
            {
                "currentForeach": null,
                "finishedForeach": null,
                "execUuid": "00000000",
                "finishedLoopCount": 0,
                "parentExecUuid": null,
                "activeChild": "bbbb",
            },
            {
                "currentForeach": null,
                "finishedForeach": null,
                "execUuid": "00000003",
                "finishedLoopCount": 0,
                "parentExecUuid": "00000000",
            }
        ]);
        assert.strictEqual(nextStep![1].step, sequence.root.childs!.byuuid.bbbb);
        
        nextStepParams = logic.getParameters(nextStep!);

        assert.deepStrictEqual(nextStepParams, {
            bin: 4,
            exposure: 10,
        });

        logic.finish(nextStep![nextStep!.length - 1]);
        
        nextStep = logic.getNextStep();
        assert.notStrictEqual(nextStep, undefined);
        assert.equal(nextStep!.length, 2);
        assert.deepStrictEqual(nextStep!.map(e=>e.status),
        [
            {
                "currentForeach": null,
                "finishedForeach": null,
                "execUuid": "00000005",
                "finishedLoopCount": 1,
                "parentExecUuid": null,
                "activeChild": "aaaa",
            },
            {
                "currentForeach": null,
                "finishedForeach": null,
                "execUuid": "00000006",
                "finishedLoopCount": 0,
                "parentExecUuid": "00000005",
            }
        ]);
        assert.strictEqual(nextStep![1].step, sequence.root.childs!.byuuid.aaaa);
        
        nextStepParams = logic.getParameters(nextStep!);

        assert.deepStrictEqual(nextStepParams, {
            bin: 2,
            exposure: 10,
        });


        logic.finish(nextStep![nextStep!.length - 1]);
        
        nextStep = logic.getNextStep();
        assert.notStrictEqual(nextStep, undefined);
        assert.equal(nextStep!.length, 2);
        assert.deepStrictEqual(nextStep!.map(e=>e.status),
        [
            {
                "currentForeach": null,
                "finishedForeach": null,
                "execUuid": "00000005",
                "finishedLoopCount": 1,
                "parentExecUuid": null,
                "activeChild": "bbbb",
            },
            {
                "currentForeach": null,
                "finishedForeach": null,
                "execUuid": "00000008",
                "finishedLoopCount": 0,
                "parentExecUuid": "00000005",
            }
        ]);
        assert.strictEqual(nextStep![1].step, sequence.root.childs!.byuuid.bbbb);

        nextStepParams = logic.getParameters(nextStep!);

        assert.deepStrictEqual(nextStepParams, {
            bin: 4,
            exposure: 10,
        });

        logic.finish(nextStep![nextStep!.length - 1]);
        
        nextStep = logic.getNextStep();
        assert.strictEqual(nextStep, undefined);
    });

    const simpleForeach:()=>Sequence=()=>({
        ...unusedFields,
        status: "idle",
        progress: null,
        
        title: "Test sequence",
        imagingSetup: "imaging_setup_id",
        errorMessage: null,
        
        stepStatus: {},
        root: {
            exposure: 10,
            repeat: 3,
            childs: {
                list: [ "aaaa" ],
                byuuid: {
                    "aaaa": {
                        foreach: {
                            param: "filter",
                            list: [
                                "aaa",
                                "bbb",
                                "ccc"
                            ],
                            byuuid: {
                                "aaa": { filter: "red" },
                                "bbb": { filter: "green"},
                                "ccc": { filter: "blue"},
                            }
                        }
                    }
                }
            }
        },
        
        // uuids of images
        images: [],
        imageStats: {},
    });

    it("scan simple foreach ", () => {
        const sequence = simpleForeach();

        const logic:SequenceLogic = new SequenceLogic(sequence, uuidMock());
        const scan = scanAccumulator();
        logic.scanParameters(scan.cb);
        assert.deepStrictEqual(scan.result, [
            {
                param: {
                    exposure: 10,
                    filter: "red",
                },
                count: 3
            },
            {
                param: {
                    exposure: 10,
                    filter: "green",
                },
                count: 3
            },
            {
                param: {
                    exposure: 10,
                    filter: "blue",
                },
                count: 3
            },
        ]);

    });

    it("proceed simple foreach", () => {
        // Really RGB, RGB, RGB
        const sequence = simpleForeach();
        
        const logic:SequenceLogic = new SequenceLogic(sequence, uuidMock());
        const uuidNext = uuidMock();

        let nextStep : ReturnType<typeof logic.getNextStep>;
        let nextStepParams;
        
        const filters = [ "red", "green", "blue"];
        const filterUuids = [ "aaa", "bbb", "ccc"];
        let execCount = 0;
        for(let repeat of [0, 1, 2]) {
            const uuidParent = uuidNext();
            for(let filterPos = 0; filterPos < filters.length; ++filterPos) {

                const filter = filters[filterPos];
                const filterUuid = filterUuids[filterPos];
                
                nextStep = logic.getNextStep();
                
                // Check parameters are exactly one
                assert.notStrictEqual(nextStep, undefined);
                assert.equal(nextStep!.length, 2);
                assert.deepStrictEqual(nextStep!.map(e=>e.status),
                [
                    {
                        "currentForeach": null,
                        "finishedForeach": null,
                        "execUuid": uuidParent,
                        "finishedLoopCount": repeat,
                        "parentExecUuid": null,
                        "activeChild": "aaaa",
                    },
                    {
                        "currentForeach": filterUuid,
                        "finishedForeach": filterUuids.slice(0, filterPos).reduce((acc:any, value:string)=>{ acc[value] = true;return acc}, {}),
                        "execUuid": uuidNext(),
                        "finishedLoopCount": 0,
                        "parentExecUuid": uuidParent,
                    }
                ], `step ${repeat} with ${filter}`);
                assert.strictEqual(nextStep![1].step, sequence.root.childs!.byuuid.aaaa);
                
                nextStepParams = logic.getParameters(nextStep!);

                assert.deepStrictEqual(nextStepParams, {
                    filter: filter,
                    exposure: 10,
                }, `step ${repeat} with ${filter}`);

                logic.finish(nextStep![nextStep!.length - 1]);
            }
            uuidNext();
        }

        nextStep = logic.getNextStep();
        assert.strictEqual(nextStep, undefined);
    });


    const twoForeach:()=>Sequence=()=>({
        ...unusedFields,
        status: "idle",
        progress: null,
        
        title: "Test sequence",
        imagingSetup: "imaging_setup_id",
        errorMessage: null,
        
        stepStatus: {},
        root: {
            repeat: 3,
            childs: {
                list: [ "aaaa", "bbbb" ],
                byuuid: {
                    "aaaa": {
                        exposure: 10,
                        foreach: {
                            param: "filter",
                            list: [
                                "aaa",
                                "bbb",
                                "ccc"
                            ],
                            byuuid: {
                                "aaa": { filter: "red" },
                                "bbb": { filter: "green"},
                                "ccc": { filter: "blue"},
                            }
                        }
                    },
                    "bbbb": {
                        exposure: 20,
                        foreach: {
                            param: "filter",
                            list: [
                                "aaa",
                                "bbb",
                                "ccc"
                            ],
                            byuuid: {
                                "aaa": { filter: "h" },
                                "bbb": { filter: "s"},
                                "ccc": { filter: "o"},
                            }
                        }
                    }
                }
            }
        },
        
        // uuids of images
        images: [],
        imageStats: {},
    });

    it("scan two foreach ", () => {
        const sequence = twoForeach();

        const logic:SequenceLogic = new SequenceLogic(sequence, uuidMock());
        const scan = scanAccumulator();
        logic.scanParameters(scan.cb);
        assert.deepStrictEqual(scan.result, [
            {
                param: {
                    exposure: 10,
                    filter: "red",
                },
                count: 3
            },
            {
                param: {
                    exposure: 10,
                    filter: "green",
                },
                count: 3
            },
            {
                param: {
                    exposure: 10,
                    filter: "blue",
                },
                count: 3
            },
            {
                param: {
                    exposure: 20,
                    filter: "h",
                },
                count: 3
            },
            {
                param: {
                    exposure: 20,
                    filter: "s",
                },
                count: 3
            },
            {
                param: {
                    exposure: 20,
                    filter: "o",
                },
                count: 3
            },
        ]);

    });

    it("proceed two foreach", () => {
        // Really RGBHSO, RGBHSO, RGBHSO
        const sequence = twoForeach();
        
        const logic:SequenceLogic = new SequenceLogic(sequence, uuidMock());
        const uuidNext = uuidMock();

        let nextStep : ReturnType<typeof logic.getNextStep>;
        let nextStepParams;
        
        const filters = [ "red", "green", "blue", "h", "s", "o"];
        const filterUuids = [ "aaa", "bbb", "ccc", "aaa", "bbb", "ccc"];
        let execCount = 0;
        for(let repeat of [0, 1, 2]) {
            const uuidParent = uuidNext();
            for(let baseId = 0; baseId < filters.length; baseId += 3) {
                for(let filterPos = baseId; filterPos < baseId + 3; ++filterPos) {
                    const filter = filters[filterPos];
                    const filterUuid = filterUuids[filterPos];
                    
                    nextStep = logic.getNextStep();
                    
                    // Check parameters are exactly one
                    assert.notStrictEqual(nextStep, undefined);
                    assert.equal(nextStep!.length, 2);
                    assert.deepStrictEqual(nextStep!.map(e=>e.status),
                    [
                        {
                            "currentForeach": null,
                            "finishedForeach": null,
                            "execUuid": uuidParent,
                            "finishedLoopCount": repeat,
                            "parentExecUuid": null,
                            "activeChild": (baseId === 0 ? "aaaa" : "bbbb"),
                        },
                        {
                            "currentForeach": filterUuid,
                            "finishedForeach": filterUuids.slice(baseId, filterPos).reduce((acc:any, value:string)=>{ acc[value] = true;return acc}, {}),
                            "execUuid": uuidNext(),
                            "finishedLoopCount": 0,
                            "parentExecUuid": uuidParent,
                        }
                    ], `step ${repeat} with ${filter}`);
                    assert.strictEqual(nextStep![1].step, baseId === 0 ? sequence.root.childs!.byuuid.aaaa : sequence.root.childs!.byuuid.bbbb);
                    
                    nextStepParams = logic.getParameters(nextStep!);

                    assert.deepStrictEqual(nextStepParams, {
                        filter: filter,
                        exposure: filterPos < 3 ? 10 : 20,
                    }, `step ${repeat} with ${filter}`);

                    logic.finish(nextStep![nextStep!.length - 1]);
                }
                uuidNext();
            }
        }

        nextStep = logic.getNextStep();
        assert.strictEqual(nextStep, undefined);
    });



    const foreachAndRepeatWithTwoChilds:()=>Sequence=()=>({
        ...unusedFields,
        status: "idle",
        progress: null,
        
        title: "Test sequence",
        imagingSetup: "imaging_setup_id",
        errorMessage: null,
        
        stepStatus: {},
        root: {
            exposure: 10,
            repeat: 2,
            foreach: {
                param: "filter",
                list: [
                    "aaa",
                    "bbb",
                    "ccc"
                ],
                byuuid: {
                    "aaa": { filter: "red" },
                    "bbb": { filter: "green"},
                    "ccc": { filter: "blue"},
                }
            },
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
        imageStats: {},
    });


    it("scan foreach & repeat with two childs", () => {
        const sequence = foreachAndRepeatWithTwoChilds();

        const logic:SequenceLogic = new SequenceLogic(sequence, uuidMock());
        const scan = scanAccumulator();
        logic.scanParameters(scan.cb);
        assert.deepStrictEqual(scan.result, [
            {
                param: {
                    exposure: 10,
                    filter: "red",
                    bin: 2,
                },
                count: 2
            },
            {
                param: {
                    exposure: 10,
                    filter: "red",
                    bin: 4
                },
                count: 2
            },
            {
                param: {
                    exposure: 10,
                    filter: "green",
                    bin: 2,
                },
                count: 2
            },
            {
                param: {
                    exposure: 10,
                    filter: "green",
                    bin: 4,
                },
                count: 2
            },
            {
                param: {
                    exposure: 10,
                    filter: "blue",
                    bin: 2,
                },
                count: 2
            },
            {
                param: {
                    exposure: 10,
                    filter: "blue",
                    bin: 4,
                },
                count: 2
            },
        ]);

    });

    it("proceed foreach & repeat with two childs", () => {
        const sequence = foreachAndRepeatWithTwoChilds();

        const logic:SequenceLogic = new SequenceLogic(sequence, uuidMock());
        const uuidNext = uuidMock();

        let nextStep : ReturnType<typeof logic.getNextStep>;
        let nextStepParams;
        
        const filters = [ "red", "green", "blue"];
        const filterUuids = [ "aaa", "bbb", "ccc"];
        let execCount = 0;
        for(let repeat of [0, 1]) {

            for(let filterPos = 0; filterPos < filters.length; ++filterPos) {
                const uuidParent = uuidNext();

                const filter = filters[filterPos];
                const filterUuid = filterUuids[filterPos];
                
                nextStep = logic.getNextStep();
                
                // Check parameters are exactly one
                assert.notStrictEqual(nextStep, undefined);
                assert.equal(nextStep!.length, 2);
                assert.deepStrictEqual(nextStep!.map(e=>e.status),
                [
                    {
                        "currentForeach": filterUuid,
                        "finishedForeach": filterUuids.slice(0, filterPos).reduce((acc:any, value:string)=>{ acc[value] = true;return acc}, {}),
                        "execUuid": uuidParent,
                        "finishedLoopCount": repeat,
                        "parentExecUuid": null,
                        "activeChild": "aaaa",
                    },
                    {
                        "currentForeach": null,
                        "finishedForeach": null,
                        "execUuid": uuidNext(),
                        "finishedLoopCount": 0,
                        "parentExecUuid": uuidParent,
                    }
                ], `First step ${repeat} with ${filter}`);
                assert.strictEqual(nextStep![1].step, sequence.root.childs!.byuuid.aaaa);
                
                nextStepParams = logic.getParameters(nextStep!);

                assert.deepStrictEqual(nextStepParams, {
                    filter: filter,
                    exposure: 10,
                    bin: 2,
                }, `First step ${repeat} with ${filter}`);

                logic.finish(nextStep![nextStep!.length - 1]);
                uuidNext();
                
                nextStep = logic.getNextStep();
                assert.notStrictEqual(nextStep, undefined);
                assert.equal(nextStep!.length, 2);
                assert.deepStrictEqual(nextStep!.map(e=>e.status),
                [
                    {
                        "currentForeach": filterUuid,
                        "finishedForeach": filterUuids.slice(0, filterPos).reduce((acc:any, value:string)=>{ acc[value] = true;return acc}, {}),
                        "execUuid": uuidParent,
                        "finishedLoopCount": repeat,
                        "parentExecUuid": null,
                        "activeChild": "bbbb",
                    },
                    {
                        "currentForeach": null,
                        "finishedForeach": null,
                        "execUuid": uuidNext(),
                        "finishedLoopCount": 0,
                        "parentExecUuid": uuidParent,
                    }
                ], `Second step ${repeat} with ${filter}`);
                assert.strictEqual(nextStep![1].step, sequence.root.childs!.byuuid.bbbb);
                
                nextStepParams = logic.getParameters(nextStep!);

                assert.deepStrictEqual(nextStepParams, {
                    filter: filter,
                    bin: 4,
                    exposure: 10,
                }, `Second step ${repeat} with ${filter}`);

                logic.finish(nextStep![nextStep!.length - 1]);
                uuidNext();
            
            }
            uuidNext();
        }

        nextStep = logic.getNextStep();
        assert.strictEqual(nextStep, undefined);
    });
});