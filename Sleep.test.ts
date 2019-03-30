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

    it("Sleep", async()=>{
        const start = new Date();
        await Sleep(CancellationToken.CONTINUE, 20);
        const end = new Date();
        assert.ok(end.getTime() - start.getTime() >= 20, "Sleep actually sleeps");
    });
});
