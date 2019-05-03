import "source-map-support/register";
import * as assert from 'assert';
import 'mocha';
import { expect } from 'chai';
import { default as SkyProjection, Map360, Map180 } from "./SkyProjection";

const hms = (h:number, m:number, s:number)=>(h + m / 60 + s / 3600);

function dist(a: number[], b:number[]) {
    let sum = 0;
    for(let i = 0; i < a.length; ++i) {
        const d = a[i] - b[i];
        sum += d * d;
    }
    return Math.sqrt(sum);
}

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

    it("compute specific alt/az", ()=> {
        // Let's go to the equator
        const equator = {lat: 0, long: 0 };

        const zenith = {relRaDeg: 0, dec: 0};
        const west = {relRaDeg: 90, dec: 0};
        const east = {relRaDeg: -90, dec: 0};
        const north = {relRaDeg: 0, dec: 90};
        const south = {relRaDeg: 0, dec: -90};
        
        const delta = 1e-6;

        expect(SkyProjection.lstRelRaDecToAltAz(zenith, equator).alt).to.be.closeTo(90, delta);

        // Cardinal points are at atl = 0
        expect(SkyProjection.lstRelRaDecToAltAz(west, equator).alt).to.be.closeTo(0, delta);
        expect(SkyProjection.lstRelRaDecToAltAz(east, equator).alt).to.be.closeTo(0, delta);
        expect(SkyProjection.lstRelRaDecToAltAz(north, equator).alt).to.be.closeTo(0, delta);
        expect(SkyProjection.lstRelRaDecToAltAz(south, equator).alt).to.be.closeTo(0, delta);

        // Azimuth orientation
        expect(SkyProjection.lstRelRaDecToAltAz(north, equator).az).to.be.closeTo(0, delta);
        expect(SkyProjection.lstRelRaDecToAltAz(south, equator).az).to.be.closeTo(180, delta);
        expect(SkyProjection.lstRelRaDecToAltAz(east, equator).az).to.be.closeTo(90, delta);
        expect(SkyProjection.lstRelRaDecToAltAz(west, equator).az).to.be.closeTo(270, delta);
    });

    it("compute alt az at 60° north", ()=> {
        const loc = {lat: 60, long: 0 };

        const west = {relRaDeg: 90, dec: 0};
        const east = {relRaDeg: -90, dec: 0};
        const north = {relRaDeg: 0, dec: 90};

        const delta = 1e-6;

        expect(SkyProjection.lstRelRaDecToAltAz(north, loc).alt).to.be.closeTo(60, delta);
        expect(SkyProjection.lstRelRaDecToAltAz(north, loc).az).to.be.closeTo(0, delta);

        expect(SkyProjection.lstRelRaDecToAltAz(east, loc).az).to.be.closeTo(90, delta);
        expect(SkyProjection.lstRelRaDecToAltAz(west, loc).az).to.be.closeTo(270, delta);
    });


    it("compute random alt/az", ()=> {
        const pos = {"relRaDeg":37.01493070502396,"dec":89.7378684725588};
        const altAz = SkyProjection.lstRelRaDecToAltAz(pos, {lat: hms(48,5,0), long: hms(1,24,0)});

        expect(altAz.az).to.be.gte(0);
        expect(altAz.az).to.be.lt(360);
        expect(altAz.alt).to.be.gte(-90);
        expect(altAz.alt).to.be.lte(90);

        expect(altAz.az).to.be.closeTo(359.7628105234194, 0.001);
        expect(altAz.alt).to.be.closeTo(hms(48,5,0) + 0.20906310251646687, 0.001);
    });


    it("Compute RA/DEC from alt az at the equator", ()=> {
        // Let's go to the equator
        const equator = {lat: 0, long: 0 };
        const delta = 1e-6;

        const zenith = SkyProjection.altAzToLstRelRaDec({alt:90, az:0}, equator);
        expect(zenith.dec).to.be.closeTo(0, delta);
        expect(zenith.relRaDeg).to.be.closeTo(0, delta);

        const north = SkyProjection.altAzToLstRelRaDec({alt:0, az:0}, equator);
        expect(north.dec).to.be.closeTo(90, delta);
        expect(north.relRaDeg).to.be.gte(0);
        expect(north.relRaDeg).to.be.lt(360);

        const east = SkyProjection.altAzToLstRelRaDec({alt:0, az:90}, equator);
        expect(east.dec).to.be.closeTo(0, delta);
        expect(east.relRaDeg).to.be.closeTo(-90, delta);

        const west = SkyProjection.altAzToLstRelRaDec({alt:0, az:270}, equator);
        expect(west.dec).to.be.closeTo(0, delta);
        expect(west.relRaDeg).to.be.closeTo(90, delta);
    });

    it("Compute RA/DEC from alt az at 60° north", ()=> {
        // Let's go to the equator
        const equator = {lat: 60, long: 0 };
        const delta = 1e-6;

        const zenith = SkyProjection.altAzToLstRelRaDec({alt:90, az:0}, equator);
        expect(zenith.dec).to.be.closeTo(60, delta);
        expect(zenith.relRaDeg).to.be.closeTo(0, delta);

        const north = SkyProjection.altAzToLstRelRaDec({alt:0, az:0}, equator);
        expect(north.dec).to.be.closeTo(30, delta);
        expect(Map180(north.relRaDeg - 180)).to.be.closeTo(0, delta);

        const east = SkyProjection.altAzToLstRelRaDec({alt:0, az:90}, equator);
        expect(east.relRaDeg).to.be.closeTo(-90, delta);
        expect(east.dec).to.be.closeTo(0, delta);

        const west = SkyProjection.altAzToLstRelRaDec({alt:0, az:270}, equator);
        expect(west.relRaDeg).to.be.closeTo(90, delta);
        expect(west.dec).to.be.closeTo(0, delta);
    });

    it("Compute Random RA/DEC <=> alt az", ()=> {
        const delta = 1e-5;
        const geoloc = {lat: hms(48, 6, 8.28), long: -hms(1,47,50)};
        // (Arcturus)
        const coordsExpected = {relRaDeg: hms(20,36,43.64) * 15, dec: hms(19,5,41.7)};
        const altAzExpected = {alt: hms(39,57,19.4), az: hms(107,8,29.2)};
        
        const altAz = SkyProjection.lstRelRaDecToAltAz(coordsExpected, geoloc);
        expect(altAz.alt).to.be.closeTo(altAzExpected.alt, delta);
        expect(altAz.az).to.be.closeTo(altAzExpected.az, delta);

        const coords = SkyProjection.altAzToLstRelRaDec(altAzExpected, geoloc);
        expect(coords.relRaDeg).to.be.closeTo(Map180(coordsExpected.relRaDeg), delta);
        expect(coords.dec).to.be.closeTo(coordsExpected.dec, delta);
    });

    it("project alt/az", ()=>{
        const delta = 1e-6;

        // In this projection, north pole is toward z axis (0,0,1). 
        // x axis points to the zenith
        // y axis points east
        
        const zenith = SkyProjection.convertAltAzTo3D({alt: 90, az: 0});
        expect(dist(zenith, [1,0,0])).to.be.closeTo(0, delta);
        
        const north = SkyProjection.convertAltAzTo3D({alt: 0, az: 0});
        expect(dist(north, [0,0,1])).to.be.closeTo(0, delta);
        
        const south = SkyProjection.convertAltAzTo3D({alt: 0, az: 180});
        expect(dist(south, [0,0,-1])).to.be.closeTo(0, delta);
        
        const east = SkyProjection.convertAltAzTo3D({alt: 0, az: 90});
        expect(dist(east, [0,1,0])).to.be.closeTo(0, delta);
        
        const west = SkyProjection.convertAltAzTo3D({alt: 0, az: 270});
        expect(dist(west, [0,-1,0])).to.be.closeTo(0, delta);
    });

    it("unproject alt/az", ()=>{
        const delta = 1e-6;

        const zenith = SkyProjection.convert3DToAltAz([1, 0, 0]);
        expect(zenith.alt).to.be.closeTo(90, delta);
        expect(zenith.az).to.be.gte(0);
        expect(zenith.az).to.be.lt(360);

        const north = SkyProjection.convert3DToAltAz([0, 0, 1]);
        expect(north.alt).to.be.closeTo(0, delta);
        expect(north.az).to.be.closeTo(0, delta);

        const south = SkyProjection.convert3DToAltAz([0, 0, -1]);
        expect(south.alt).to.be.closeTo(0, delta);
        expect(south.az).to.be.closeTo(180, delta);

        const east = SkyProjection.convert3DToAltAz([0, 1, 0]);
        expect(east.alt).to.be.closeTo(0, delta);
        expect(east.az).to.be.closeTo(90, delta);

        const west = SkyProjection.convert3DToAltAz([0, -1, 0]);
        expect(west.alt).to.be.closeTo(0, delta);
        expect(west.az).to.be.closeTo(270, delta);
    });

    it("rotate in altAz", () => {
        const delta = 1e-6;

        const zenith = [1, 0, 0];
        const north =  [0, 0, 1];
        const south =  [0, 0, -1];
        const east =   [0, 1, 0];
        const west =  [0, -1, 0];

        expect(dist(
            SkyProjection.rotate(zenith, SkyProjection.altAzRotation.toNorth, 90),
            north))
            .to.be.closeTo(0, delta);

        expect(dist(
            SkyProjection.rotate(zenith, SkyProjection.altAzRotation.toSouth, 90),
            south))
            .to.be.closeTo(0, delta);

        expect(dist(
            SkyProjection.rotate(north, SkyProjection.altAzRotation.toWest, 90),
            west))
            .to.be.closeTo(0, delta);
        expect(dist(
            SkyProjection.rotate(west, SkyProjection.altAzRotation.toWest, 90),
            south))
            .to.be.closeTo(0, delta);

        expect(dist(
            SkyProjection.rotate(north, SkyProjection.altAzRotation.toEast, 90),
            east))
            .to.be.closeTo(0, delta);
        expect(dist(
            SkyProjection.rotate(south, SkyProjection.altAzRotation.toEast, 90),
            west))
            .to.be.closeTo(0, delta);
    });
});

