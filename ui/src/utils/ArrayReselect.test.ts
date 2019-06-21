import ArrayReselect from './ArrayReselect';


// import React from 'react';
// import ReactDOM from 'react-dom';
// import App from './App';

it('is ok', () => {

    const arraySelector = ArrayReselect.createArraySelector<any,void,any>((a:[number])=>a.map((i)=>i*2));

    const allOne = [1,1,1];
    const r1 = arraySelector(allOne, undefined);
    const r2 = arraySelector(allOne, undefined);
    expect(r1).toBe(r2);

    const allOne2 = [1,1,1];
    expect(allOne).not.toBe(allOne2);
    const r3 = arraySelector(allOne2, undefined);
    expect(r3).toBe(r1);
});
