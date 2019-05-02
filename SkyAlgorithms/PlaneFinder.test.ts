import "source-map-support/register";
import * as assert from 'assert';
import 'mocha';
import { expect } from 'chai';
import * as PlaneFinder from "./PlaneFinder";


function applyPlaneEq(eq:PlaneFinder.PlaneEquation, d: number[])
{
    return d[0] * eq[0] +
           d[1] * eq[1] +
           d[2] * eq[2] +
           eq[3];
}

const tol = 1e-6;

describe("PlaneFinder", ()=> {
    it("Fit basic data at z = 0", ()=>{
        const data = [
            [ 0, 0, 0 ],
            [ 5, 7, 0 ],
            [ 14, 0, 0],
        ];

        const bestFit = PlaneFinder.bestFit(data);
        if (bestFit === null) throw new Error("Failed");
        expect(applyPlaneEq(bestFit, data[0])).to.be.closeTo(0, tol);
        expect(applyPlaneEq(bestFit, data[1])).to.be.closeTo(0, tol);
        expect(applyPlaneEq(bestFit, data[2])).to.be.closeTo(0, tol);
        expect(Math.abs(applyPlaneEq(bestFit, [0,0,1]))).to.be.closeTo(1, tol);
    });

    it("Fit basic data at z > 0", ()=>{
        const data = [
            [ 0, 0, 5 ],
            [ 5, 7, 5 ],
            [ 14, 0, 5],
        ];

        const bestFit = PlaneFinder.bestFit(data);
        if (bestFit === null) throw new Error("Failed");
        expect(applyPlaneEq(bestFit, data[0])).to.be.closeTo(0, tol);
        expect(applyPlaneEq(bestFit, data[1])).to.be.closeTo(0, tol);
        expect(applyPlaneEq(bestFit, data[2])).to.be.closeTo(0, tol);
        expect(Math.abs(applyPlaneEq(bestFit, [0,0,4]))).to.be.closeTo(1, tol);
    });

    it("Fit noisy data", () => {
        const data = [
            [ 0, 0, 0 ],
            [ 5, 7, 0 ],
            [ 14, 0, 0],
            [ 12, 13, 0],
            [ -5, 7, 0 ],
            [ -14, 0, 0],
            [ -13, -12, 0 ],
        ];

        // 1% noise
        function noise(d:number) {
            return d + Math.random() * 0.02 / 2;
        }

        const noisyData = data.map(e=>e.map(noise));
        const bestFit = PlaneFinder.bestFit(noisyData);
        if (bestFit === null) throw new Error("Failed");
        
        const noiseTol = 0.01;
        for(const d of data) {
            expect(applyPlaneEq(bestFit, data[0])).to.be.closeTo(0, noiseTol + tol);
        }
        expect(Math.abs(applyPlaneEq(bestFit, [0,0,1]))).to.be.closeTo(1, noiseTol + tol);
    });
});
