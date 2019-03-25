// import { expect } from 'chai';
// import 'mocha';
// import {Cancelable, Concurrent, Chain, Sleep, ExecutePromise, Immediate} from './Promises';

// TODO : convert to test

// describe("Cancelable Promise", ()=> {
//     it("propagates direct result", ()=> {
//         var checked = false;
//         new Cancelable((next, t)=>
//         {
//                 expect(t).to.equal(1, "Input argument provided");
//                 next.done(t + 1);
//         })
//             .then((rslt) => { checked = true; expect(rslt).to.equal(2, "Direct result"); })
//             .start(1);
//         expect(checked).to.be.true;
//     });

//     it("propagtes indirect result", ()=>new Promise((resolve, reject) => {
//         var checked = false;
//         new Chain(
//             new Sleep(1),
//             new Cancelable((next, t)=>
//             {
//                 expect(t).to.equal(1, "Input argument is passed");
//                 next.done(t + 1);
//             })
//         )
//             .then((rslt) => { checked = true; expect(rslt).to.equal(2, "Direct result"); })
//             .start(1);

//         expect(checked).to.be.false;

//         setTimeout(() => {
//             expect(checked).to.be.true;
//             resolve();
//         }, 10);
//     }));


//     it('accept dynamic promises', ()=>{
//         var providerCalled = false;
//         var done = false;
//         new Chain(
//             new Cancelable((next, t) => {
//                 providerCalled = true;
//                 var result = new Cancelable((next, arg) => {
//                     expect(arg).to.equal(undefined, "Input argument received");
//                     next.done("success");
//                 });
//                 next.done(result);
//             }),
//             new ExecutePromise()
//         ).then((rslt) =>{
//             done = true;
//             expect(rslt).to.equal("success", "Produced value not returned");
//         }).start(122);

//         expect(providerCalled).to.be.true;
//         expect(done).to.be.true;
//     });

//     function expectResult(promise, input, onResultErrorCanceled)
//     {
//         promise.then((rslt)=> {
//             onResultErrorCanceled(rslt, undefined, false);
//         });
//         promise.onError((err)=>{
//             onResultErrorCanceled(undefined, err, false);
//         });
//         promise.onCancel(()=>{
//             onResultErrorCanceled(undefined, undefined, true);
//         });

//         promise.start(input);
//         return promise;
//     }

//     it('Perfoms concurrently - direct', () => {
//         expectResult(
//             new Concurrent(
//                 new Chain(
//                     new Sleep(1),
//                     new Immediate(()=>'a')),
//                 new Chain(
//                     new Sleep(2),
//                     new Immediate(()=>'b')),
//                 new Chain(
//                     new Immediate(()=>'c'))
//             ),
//             0,
//             (result, error, canceled)=> {
//                 expect(error).to.be.undefined;
//                 expect(canceled).to.be.false;
//                 expect(result).to.deep.equal(['a', 'b', 'c'])
//             }
//         );
//     });

//     it('Perfoms concurrently - immediate error', () => {
//         let sthDone = false;
//         expectResult(
//             new Concurrent(
//                 new Immediate(()=>{throw "erreur1"}),
//                 new Immediate(()=>{sthDone = true})
//             ),
//             0,
//             (result, error, canceled)=> {
//                 expect(error).to.equal("erreur1");
//                 expect(sthDone).to.equal(false);
//             }
//         );
//     });

//     it('Perfoms concurrently - deffered error', () => {
//         let sthDone = false;
//         expectResult(
//             new Concurrent(
//                 new Chain(
//                     new Sleep(1),
//                     new Immediate(()=>{throw "erreur1"})),
//                 new Chain(
//                     new Sleep(2000),
//                     new Immediate(()=>{sthDone = true})),
//                 new Chain(
//                     new Sleep(2000),
//                     new Immediate(()=>{sthDone = true})),
//             ),
//             0,
//             (result, error, canceled)=> {
//                 expect(error).to.equal("erreur1");
//                 expect(sthDone).to.equal(false);
//             }
//         );
//     });

//     it('Perfoms concurrently - cancel', () => {
//         let sthDone = false;
//         expectResult(
//             new Concurrent(
//                 new Chain(
//                     new Sleep(1000),
//                     new Immediate(()=>{sthDone = true})),
//                 new Chain(
//                     new Sleep(1000),
//                     new Immediate(()=>{sthDone = true}))
//             ),
//             0,
//             (result, error, canceled)=> {
//                 expect(canceled).to.equal(true);
//                 expect(sthDone).to.equal(false);
//             }
//         ).cancel();
//     });

// });

