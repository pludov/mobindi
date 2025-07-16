import "source-map-support/register";
import * as assert from 'assert';
import 'mocha';
import { expect } from 'chai';
import * as PolarAlignment from "./PolarAlignment";
import SkyProjection from "./SkyProjection";
import fs from 'fs';

//@ts-ignore
const Quaternion = require("quaternion");

function hms(h:number, m:number, s:number):number {
    const sgn = h < 0 ? -1 : 1;
    h = Math.abs(h);
    return sgn * (h + m / 60 + s /3600);
}

function dist(a: number[], b:number[]) {
    let sum = 0;
    for(let i = 0; i < a.length; ++i) {
        const d = a[i] - b[i];
        sum += d * d;
    }
    return Math.sqrt(sum);
}

describe("Polar Alignment", ()=> {
    const home = {lat: hms(48, 6, 8), long: hms(-1, 47, 50)};
    const vega = {ra: hms(18,37,36.18), dec: hms(38,48,14.8)};
    const arcturus = {ra: hms(14,16,33.7), dec: hms(19,4,49.1)};
    const antares = {ra: hms(16,30,37.08), dec: hms(-26,28,23.7)};
    const testEpoch = new Date("2019-05-01T02:43:11.000Z").getTime() / 1000.0;

    it("Compute valid ra travel range for Vega (east)", ()=>{
        const ret = PolarAlignment.computeRaRange(
            home, vega, testEpoch,
            {
                angle: 90,
                minAltitude: 10,
                meridianGuard: 0,
            });
        expect(ret.end).to.eq(0);
        expect(ret.start).to.be.closeTo(6, 1/15);
    });
    it("Compute valid ra travel range for Arcturus (west)", ()=>{
        const ret = PolarAlignment.computeRaRange(
            home, arcturus, testEpoch,
            {
                angle: 90,
                minAltitude: 10,    // Don't descend under this alt
                meridianGuard: 0,
            });
        expect(ret.end).to.eq(0);
        expect(ret.start).to.be.closeTo(-6, 1/15);
    });
    it("Compute valid ra travel range for Antares (south/west)", ()=>{
        // This range is cut by horizon.
        const ret = PolarAlignment.computeRaRange(
            home, antares, testEpoch,
            {
                angle: 90,
                minAltitude: 10,    // Don't descend under this alt=> f
                meridianGuard: 0,
            });
        expect(ret.end).to.eq(0);
        expect(ret.start).to.be.closeTo(-(2+10/60), 1/15);
    });
    it("Compute valid ra travel range for Antares (south/west), with guard", ()=>{
        // This range is cut by horizon.
        const ret = PolarAlignment.computeRaRange(
            home, antares, testEpoch,
            {
                angle: 90,
                minAltitude: 10,    // Don't descend under this alt=> f
                meridianGuard: 2,
            });
        expect(ret.end).to.be.closeTo(-2/15, 0.00001);
        expect(ret.start).to.be.closeTo(-(2+10/60), 1/15);
    });

});
