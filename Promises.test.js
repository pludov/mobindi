import { expect } from 'chai';
import 'mocha';
import {Cancelable, Chain, Sleep,ExecutePromise} from './Promises';

describe("Cancelable Promise", ()=> {
    it("propagates direct result", ()=> {
        var checked = false;
        new Cancelable((next, t)=>
        {
                expect(t).to.equal(1, "Input argument provided");
                next.done(t + 1);
        })
            .then((rslt) => { checked = true; expect(rslt).to.equal(2, "Direct result"); })
            .start(1);
        expect(checked).to.be.true;
    });

    it("propagtes indirect result", ()=>new Promise((resolve, reject) => {
        var checked = false;
        new Chain(
            new Sleep(1),
            new Cancelable((next, t)=>
            {
                expect(t).to.equal(1, "Input argument is passed");
                next.done(t + 1);
            })
        )
            .then((rslt) => { checked = true; expect(rslt).to.equal(2, "Direct result"); })
            .start(1);

        expect(checked).to.be.false;

        setTimeout(() => {
            expect(checked).to.be.true;
            resolve();
        }, 10);
    }));


    it('accept dynamic promises', ()=>{
        var providerCalled = false;
        var done = false;
        new Chain(
            new Cancelable((next, t) => {
                providerCalled = true;
                var result = new Cancelable((next, arg) => {
                    expect(arg).to.equal(undefined, "Input argument received");
                    next.done("success");
                });
                next.done(result);
            }),
            new ExecutePromise()
        ).then((rslt) =>{
            done = true;
            expect(rslt).to.equal("success", "Produced value not returned");
        }).start(122);

        expect(providerCalled).to.be.true;
        expect(done).to.be.true;
    });
});

