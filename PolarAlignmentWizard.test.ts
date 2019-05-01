import "source-map-support/register";
import * as assert from 'assert';
import 'mocha';
import { expect } from 'chai';
import PolarAlignmentWizard from "./PolarAlignmentWizard";

function hms(h:number, m:number, s:number):number {
    const sgn = h < 0 ? -1 : 1;
    h = Math.abs(h);
    return sgn * (h + m / 60 + s /3600);
}

describe("Polar Alignment", ()=> {
    const home = {lat: hms(48, 6, 8), long: hms(-1, 47, 50)};
    const vega = {ra: hms(18,37,36.18), dec: hms(38,48,14.8)};
    const arcturus = {ra: hms(14,16,33.7), dec: hms(19,4,49.1)};
    const antares = {ra: hms(16,30,37.08), dec: hms(-26,28,23.7)};
    const testEpoch = new Date("2019-05-01T02:43:11.000Z").getTime() / 1000.0;
    it("Compute valid ra range for Vega (east)", ()=>{
        const ret = PolarAlignmentWizard.computeRaRange(
            home, vega, testEpoch,
            {
                angle: 90,
                minAltitude: 10,    // Don't descend under this alt
            });
        expect(ret.end).to.eq(0);
        expect(ret.start).to.be.closeTo(6, 1/15);
    });
    it("Compute valid ra range for Arcturus (west)", ()=>{
        const ret = PolarAlignmentWizard.computeRaRange(
            home, arcturus, testEpoch,
            {
                angle: 90,
                minAltitude: 10,    // Don't descend under this alt
            });
        expect(ret.end).to.eq(0);
        expect(ret.start).to.be.closeTo(-6, 1/15);
    });
    it("Compute valid ra range for Antares (south/west)", ()=>{
        // This range is cut by horizon.
        const ret = PolarAlignmentWizard.computeRaRange(
            home, antares, testEpoch,
            {
                angle: 90,
                minAltitude: 10,    // Don't descend under this alt=> f
            });
        expect(ret.end).to.eq(0);
        expect(ret.start).to.be.closeTo(-(2+10/60), 1/15);
    });
});
