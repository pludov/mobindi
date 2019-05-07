import "source-map-support/register";
import * as assert from 'assert';
import 'mocha';
import { expect } from 'chai';
import { default as SkyProjection, Map360, Map180 } from "./SkyProjection";
import { SucceededAstrometryResult } from "@src/shared/ProcessorTypes";
const Quaternion = require("quaternion");

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

    it("converts astrometry to quaternion", ()=> {
        const raDecDelta = 1e-7;
        const delta = 1e-7;
        const astrom: SucceededAstrometryResult = {
            "found":true,
            "cd1_1":-0.00016379701531,
            "cd1_2":0.000747030024024,
            "cd2_1":-0.000747131304567,
            "cd2_2":-0.000165084805207,
            "raCenter":149.502516809,
            "decCenter":70.0465404471,
            "width":4290,
            "height":2856,
            "refPixX":814.188110352,
            "refPixY":1455.15181478,
        };
        const coords = {
            ra: 148.83605877929057,
            dec: 69.05553441221691,
        }
        const angle = 102.414;

        const skyProj = SkyProjection.fromAstrometry(astrom);
        
        const thCoords = skyProj.pixToRaDec([astrom.width / 2, astrom.height / 2]);
        console.log('coords vs thCoords', coords, thCoords);
        expect(dist(thCoords, [coords.ra, coords.dec])).to.be.closeTo(0, raDecDelta, "pixToRaDec");



        const quaternion = skyProj.getQuaternionAtCenter([astrom.width / 2, astrom.height / 2]);
        const centerPt3d = SkyProjection.convertRaDecTo3D([coords.ra, coords.dec]);
        // Check the center project back to good pos.
        expect(dist(quaternion.rotateVector([0,0,1]), centerPt3d)).to.be.closeTo(0, delta, "quaternion at center");

        // // Check the north project back to good pos.
        // const topCoords = SkyProjection.convertRaDecTo3D(skyProj.pixToRaDec([astrom.width / 2, 0]));
        // console.log("skyProj.pixelRad", skyProj.pixelRad, topCoords);
        // console.log("quaternion.rotateVector([0,astrom.height * skyProj.pixelRad / 2,1])",quaternion.rotateVector([0,astrom.height * skyProj.pixelRad / 2,1]));
        // expect(dist(quaternion.rotateVector([0,astrom.height * skyProj.pixelRad / 2,1]), topCoords)).to.be.closeTo(0, delta);

        // const axe = (id:number, value:number)=>[
        //     id == 0 ? value : 0,
        //     id == 1 ? value : 0,
        //     id == 2 ? value : 0,
        // ];

        // const expend=(d:number[]):Array<number[]>=>{
        //     if (d.length === 0) {
        //         return [[]];
        //     }
        //     if (d[0] === 0) {
        //         return expend(d.slice(1)).map(e=>[0, ...e]);
        //     }
        //     const vals = [-2,-1,1,2];
        //     const ret = [];
        //     for(const i of expend(d.slice(1))) {
        //         for(const v of vals) {
        //             ret.push([v, ...i]);
        //         }
        //     }
        //     return ret;
        // }

        // for(const order of [[0,1,2],[0,2,1],[1,2,0],[1,0,2],[2,0,1],[2,1,0]]) {
        //     for(const bitAmmount of [[1,1,1],[1,1,0],[1,0,1],[0,1,1],[1,0,0],[0,1,0],[0,0,1]])
        //         for(const ammount of expend(bitAmmount))
        //         {
        //             let axisQuat = Quaternion.fromBetweenVectors([0,0,1],[1,0,0]);
        //             let quat = new Quaternion();
        //             for(let i =0 ; i < 3; ++i) {
        //                 if (ammount[i] === 0) {
        //                     continue;
        //                 }
        //                 const ax = order[i];
        //                 quat = quat.mul(Quaternion.fromAxisAngle(axe(ax,1), ammount[i]*Math.PI/2));
        //             }
        //             // quat = axisQuat.mul(quat);
        //             const d = dst(
        //                 // Quaternion.fromAxisAngle(axe(1,1), Math.PI/2)
        //                 // .mul(Quaternion.fromAxisAngle(axe(d,1), Math.PI/2))
        //                 quat
        //                 .mul(quaternionAtRef.inverse())
        //                 .mul(axisQuat)
        //                 .rotateVector([0,0,1]));
        //             if (d < 0.01) {
        //                 console.log('ICI', order, ammount);
        //             }
        //             console.log('Candidatte ', dst(
        //                         // Quaternion.fromAxisAngle(axe(1,1), Math.PI/2)
        //                         // .mul(Quaternion.fromAxisAngle(axe(d,1), Math.PI/2))
        //                         quat
        //                         .mul(quaternionAtRef.inverse())
        //                         .mul(axisQuat)
        //                         .rotateVector([0,0,1])));
        //         }
        //     // console.log('Candidatte ', dst(quaternionAtRef.rotateVector([d*1,d*0,d*0])));
        //     // console.log('Candidatte ', dst(quaternionAtRef.rotateVector([d*0,d*1,d*0])));
        //     // console.log('Candidatte ', dst(quaternionAtRef.rotateVector([d*0,d*0,d*1])));

        //     // console.log('Candidatte ', dst(quaternionAtRef.inverse().rotateVector([d*0,d*1,d*0])));
        //     // console.log('Candidatte ', dst(quaternionAtRef.inverse().rotateVector([d*0,d*0,d*1])));
        // }

        const pixToImage3d = (xy:number[])=> {
            const x = (xy[0] - skyProj.centerx) * skyProj.pixelRad;
            const y = (xy[1] - skyProj.centery) * skyProj.pixelRad;
    
            const z3d = 1.0 / Math.sqrt(y * y + x * x + 1.0);
            const x3d = x * z3d;
            const y3d = y * z3d;
            return [x3d, y3d, z3d];
        }

        for(const pos of [ [skyProj.centerx, skyProj.centery] ])
        {

            const quaternionAtRef = skyProj.getQuaternionAtCenter(pos);
            // const refPt3d = SkyProjection.convertRaDecTo3D(skyProj.pixToRaDec([skyProj.centerx, skyProj.centery]));
            const refPt3d = skyProj.invertedTransform.convert(pixToImage3d(pos));

            console.log('Looking for ', refPt3d);


            const d = dist(quaternionAtRef.rotateVector([0,0,1]), refPt3d);
            console.log('Final dist ICI', d);

            expect(dist(quaternionAtRef.rotateVector([0,0,1]), refPt3d)).to.be.closeTo(0, delta, "getQuaternionAtCenter for " + JSON.stringify(pos));

            for(const dlt of [ [1000,1000], [0,1000], [1000, 0], [-1000,0], [0,-1000] ]) {
                // const refPtX = SkyProjection.convertRaDecTo3D(skyProj.pixToRaDec([pos[0] + dlt[0], pos[1] + dlt[1]]));
                const refPtX = skyProj.invertedTransform.convert(pixToImage3d([pos[0] + dlt[0], pos[1] + dlt[1]]));

                const quadPtX = quaternionAtRef.rotateVector(pixToImage3d([pos[0] + dlt[0], pos[1] + dlt[1]]));
                let dx = dist(quadPtX, refPtX);
                console.log('dx (pixel) = ', dx / skyProj.pixelRad);
                expect(dx / skyProj.pixelRad).to.be.closeTo(0, 2);
            }
        }
    });
});

