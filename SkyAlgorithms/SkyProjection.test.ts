import "source-map-support/register";
import * as assert from 'assert';
import 'mocha';
import { expect } from 'chai';
import { default as SkyProjection, Map360 } from "./SkyProjection";

const hms = (h:number, m:number, s:number)=>(h + m / 60 + s / 3600);

describe("Astronomic computations", ()=> {
    it("Compute lst", ()=>{
        const tol = 1/3600;

        const lst = SkyProjection.getLocalSideralTime;

        const utc2epoch = (s:string)=>new Date(s).getTime() / 1000.0;

        expect(lst(utc2epoch('2025-04-30T18:25:12.000Z'), 12)).to.be.closeTo(hms(9, 48, 58.262), tol);

        expect(lst(utc2epoch('2018-11-11T23:59:59.000Z'), 179)).to.be.closeTo(hms(15, 20, 16.543), tol);

        expect(lst(utc2epoch('2019-04-28T16:23:42.000Z'), -76.8233055)).to.be.closeTo(hms(1, 41, 48), tol);

        expect(lst(1556471378, 0.0)).to.be.closeTo(hms(7, 35, 10.6), 1.0/3600);

        // This is ok (from http://neoprogrammics.com/sidereal_time_calculator/)
        expect(lst(utc2epoch('2000-01-01T12:00:00.000Z'), 0)).to.be.closeTo(hms(18, 41, 49.696), tol);

        // This is wrong: http://www.csgnetwork.com/siderealjuliantimecalc.html
        // expect(lst(utc2epoch('2000-01-01T12:00:00.000Z'), 0)).to.be.closeTo(hms(18, 41, 49.529), tol);
    });

    it("Maps angles", ()=> {
        for(let k of [ -3, -2, -1, 0, 1, 2, 3]) {
            const dlt = 360*k;
        
            expect(Map360(0 + dlt)).to.equal(0, 'modulo ' + dlt);
            expect(Map360(1 + dlt)).to.equal(1, 'modulo ' + dlt);
            expect(Map360(179 + dlt)).to.equal(179, 'modulo ' + dlt);
            expect(Map360(359 + dlt)).to.equal(359, 'modulo ' + dlt);
        }
    });

    it("compute alt/az", ()=> {
        const pos = {"relRaDeg":37.01493070502396,"dec":89.7378684725588};
        const altAz = SkyProjection.lstRelRaDecToAltAz(pos, {lat: hms(48,5,0), long: hms(1,24,0)});
        
        expect(altAz.az).to.be.gte(0);
        expect(altAz.az).to.be.lt(360);
        expect(altAz.alt).to.be.gte(-90);
        expect(altAz.alt).to.be.lte(90);

        expect(altAz.az).to.be.closeTo(719.7628106782554-360, 0.001);
        expect(altAz.alt).to.be.closeTo(hms(48,5,0) + 0.20906310251646687, 0.001);
    });
});

