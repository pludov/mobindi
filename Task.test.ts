import "source-map-support/register";
import * as assert from 'assert';
import 'mocha';
import { createTask } from './Task';
import CancellationToken from 'cancellationtoken';
import Sleep from "./Sleep";

let unhandledRejection: number = 0;

function cleanupUnhandledRejection() {
    unhandledRejection = 0;
}

function hadUnhandledRejection() {
    return unhandledRejection !== 0;
}

process.on('unhandledRejection', (reason, p) => {
    console.log('rejected promise : ' + (p as any).uid);
    console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
    unhandledRejection++;
    // application specific logging, throwing an error, or other logic here
});

describe("Task", ()=> {
    beforeEach(cleanupUnhandledRejection);
    afterEach(()=> {
        assert.equal(hadUnhandledRejection(), false);
    });

    it("Catch immediate errors", async()=>{
        const msg = "supposed to be catch";
        let error;
        try {
            await createTask(CancellationToken.CONTINUE,
                async()=> {
                    throw new Error(msg);
                }
            );
        } catch(e) {
            error = e;
        }
        assert.notStrictEqual(error, undefined, "Error must be catched");
        assert.strictEqual(error.message, msg, "Right error must be catched");
    });

    it("Returns immediate success", async()=>{
        const token = "expected return value";
        const result =
            await createTask(CancellationToken.CONTINUE,
                async(task)=> {
                    return token;
                }
            );
        assert.equal(result, token, "Valid result");
    });

    it("Returns delayed success", async()=>{
        const token = "expected return value";
        const result =
            await createTask(CancellationToken.CONTINUE,
                async(task)=> {
                    await Sleep(task.cancellation, 1);
                    return token;
                }
            );
        assert.equal(result, token, "Valid result");
    });

    it("Catch delayed errors", async()=>{
        const msg = "supposed to be catch";
        let error;
        try {
            await createTask(CancellationToken.CONTINUE,
                async()=> {
                    await Sleep(CancellationToken.CONTINUE, 1);
                    throw new Error(msg);
                }
            );
        } catch(e) {
            error = e;
        }
        assert.notStrictEqual(error, undefined, "Error must be catched");
        assert.strictEqual(error.message, msg, "Right error must be catched");
    });

    it("Handle parallel task", async()=> {
        // task1 should end by its own cancel only
        const task1 = createTask<void>(CancellationToken.CONTINUE,
                async(task)=> {
                    await Sleep(task.cancellation, 10000);
                });
        try {
            await Sleep(CancellationToken.CONTINUE, 1);
        } finally {
            let error;
            try {
                task1.cancel();

                await task1;
            } catch(e) {
                error = e;
            }
            assert.notStrictEqual(error, undefined, "Parallel task must be canceled");
            assert.ok(error instanceof CancellationToken.CancellationError, "Parallel task must be canceled");
        }
    });

    it("Calling cancel on terminated task has no effect", async()=> {
        let cancelCalled: boolean = false;
        let done: boolean = false;
        const task1 = createTask<void>(CancellationToken.CONTINUE,
            async(task)=> {
                task.cancellation.onCancelled(()=> {
                    cancelCalled = true;
                });
                await Sleep(CancellationToken.CONTINUE, 1);
                done = true;
            });
        task1.catch((e)=>{});
        while (!done) {
            await Sleep(CancellationToken.CONTINUE, 10);
        }
        task1.cancel();
        await task1;
        assert.notStrictEqual(cancelCalled, true, "Cancel must not be called");
    });


    it("Handle rejectiong of parallel task", async()=> {
        // task1 should end by its own cancel only
        let error = undefined;
        let task1done = false;
        const msg = "task1 dying";
        const task1 = createTask(CancellationToken.CONTINUE,
                async()=> {
                    await Sleep(CancellationToken.CONTINUE, 1);
                    task1done = true;
                    throw new Error(msg);
                });
        task1.catch((e)=>{});
        try {
            while(!task1done) {
                await Sleep(CancellationToken.CONTINUE, 2);
            }
        } finally {
            try {
                task1.cancel();
                await task1;
            } catch(e) {
                error = e;
            }
        }
        assert.notStrictEqual(error, undefined, "Error must be catched");
        assert.strictEqual(error.message, msg, "Right error must be catched");
    });
});
