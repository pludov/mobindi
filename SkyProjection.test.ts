import "source-map-support/register";
import * as assert from 'assert';
import 'mocha';
import { expect } from 'chai';
import SkyProjection from "./ui/src/utils/SkyProjection";


describe("Astronomic computations", ()=> {
    it("Compute lst", ()=>{
        const tol = 1/3600;

        const lst = SkyProjection.getLocalSideralTime;

        const hms = (h:number, m:number, s:number)=>(h + m / 60 + s / 3600);
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
});

