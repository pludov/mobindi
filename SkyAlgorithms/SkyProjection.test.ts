import "source-map-support/register";
import * as assert from 'assert';
import 'mocha';
import { expect } from 'chai';
import { default as SkyProjection, Map360, Map180 } from "./SkyProjection";
import { SucceededAstrometryResult } from "@src/shared/ProcessorTypes";
const Quaternion = require("quaternion");

const hms = (h:number, m:number, s:number)=>(h + m / 60 + s / 3600);

function norm(a: number[]) {
    let sum = 0;
    for(let i = 0; i < a.length; ++i) {
        const d = a[i];
        sum += d * d;
    }
    return Math.sqrt(sum);
}


function dist(a: number[], b:number[]) {
    let sum = 0;
    for(let i = 0; i < a.length; ++i) {
        const d = a[i] - b[i];
        sum += d * d;
    }
    return Math.sqrt(sum);
}

// Evaluation of angular distance, %360
function degDist(a:number[], b: number[]) {
    return dist([0,0], [
                    Map180(a[0]-b[0]),
                    Map180(a[1]-b[1]),
    ]);
}

function altazDist(a:{alt: number, az:number}, b: {alt: number, az:number}) {
    return dist([0,0], [
                    Map180(a.alt-b.alt),
                    Map180(a.az-b.az),
    ]);
}

function relRaDecDist(a:{relRaDeg: number, dec:number}, b: {relRaDeg: number, dec:number}) {
    return dist([0,0], [
                    Map180(a.relRaDeg-b.relRaDeg),
                    Map180(a.dec-b.dec),
    ]);
}

describe("Astronomic computations", ()=> {
    it("[ra,dec]<=>EQ3D", ()=> {
        const expectations = [
            {
                id: "north pole",
                raDec: [0,90],
                eq3d: [0,0,1],
            },{
                id: "ra = 0",
                raDec: [0,0],
                eq3d: [1,0,0],
            },{
                id: "ra = -6h",
                raDec: [-90,0],
                eq3d: [0,-1,0],
            },{
                id: "ra = +6h",
                raDec: [90,0],
                eq3d: [0,1,0],
            },
        ];
        
        for(const e of expectations) {
            const eq3d_computed = SkyProjection.convertRaDecToEQ3D(e.raDec);
            const raDec_computed = SkyProjection.convertEQ3DToRaDec(e.eq3d);
            
            expect(dist(e.eq3d, eq3d_computed)).to.be.closeTo(0, 1e-12, "radec=>eq3d:" + e.id);
            expect(degDist(e.raDec, raDec_computed)).to.be.closeTo(0, 1e-8, "eq3d=>radec:" + e.id);

            const quaternion = SkyProjection.getEQ3DQuaternion(e.raDec);
            const eq3d_fromq = quaternion.rotateVector([1, 0, 0]);
            expect(dist(e.eq3d, eq3d_fromq)).to.be.closeTo(0, 1e-12, "eq3d_quaternion:" + e.id);
        }
    });
    
    it("Compute lst", ()=>{
        const tol = 1/3600;

        const lst = (a:number,b:number)=>SkyProjection.getLocalSideralTime(a,b)/15;

        const utc2epoch = (s:string)=>new Date(s).getTime();

        expect(lst(utc2epoch('2025-04-30T18:25:12.000Z'), 12)).to.be.closeTo(hms(9, 48, 58.262), tol);

        expect(lst(utc2epoch('2018-11-11T23:59:59.000Z'), 179)).to.be.closeTo(hms(15, 20, 16.543), tol);

        expect(lst(utc2epoch('2019-04-28T16:23:42.000Z'), -76.8233055)).to.be.closeTo(hms(1, 41, 48), tol);

        expect(lst(1556471378000, 0.0)).to.be.closeTo(hms(7, 35, 10.6), 1.0/3600);

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
        const west = {relRaDeg: -90, dec: 0};
        const east = {relRaDeg: 90, dec: 0};
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

        const west = {relRaDeg: -90, dec: 0};
        const east = {relRaDeg: 90, dec: 0};
        const north = {relRaDeg: 0, dec: 90};

        const delta = 1e-6;

        expect(SkyProjection.lstRelRaDecToAltAz(north, loc).alt).to.be.closeTo(60, delta);
        expect(SkyProjection.lstRelRaDecToAltAz(north, loc).az).to.be.closeTo(0, delta);

        expect(SkyProjection.lstRelRaDecToAltAz(east, loc).az).to.be.closeTo(90, delta);
        expect(SkyProjection.lstRelRaDecToAltAz(west, loc).az).to.be.closeTo(270, delta);
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
        expect(east.relRaDeg).to.be.closeTo(90, delta);

        const west = SkyProjection.altAzToLstRelRaDec({alt:0, az:270}, equator);
        expect(west.dec).to.be.closeTo(0, delta);
        expect(west.relRaDeg).to.be.closeTo(-90, delta);
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
        expect(east.relRaDeg).to.be.closeTo(90, delta);
        expect(east.dec).to.be.closeTo(0, delta);

        const west = SkyProjection.altAzToLstRelRaDec({alt:0, az:270}, equator);
        expect(west.relRaDeg).to.be.closeTo(-90, delta);
        expect(west.dec).to.be.closeTo(0, delta);
    });

    it("compute random alt/az", ()=> {
        // const msTime = new Date("2019-05-09T12:32:03.000Z").getTime();
        const geoCoords = {lat:hms(48,6,8), long:-hms(1,47,50)};
        const lst = 15 * hms(3,32,59.97);

        const raDec = {ra: 15 * hms(7,46,31.08), dec: hms(27,58,32.1)};
        const altAz = {alt: hms(37,50,15.7), az:hms(88,38,31.5) };

        const computedAltAz = SkyProjection.lstRelRaDecToAltAz({relRaDeg: raDec.ra - lst, dec: raDec.dec}, geoCoords);

        expect(altazDist(computedAltAz, altAz)).to.be.closeTo(0, 1e-4);

        const computedRaDec = SkyProjection.altAzToLstRelRaDec(altAz, geoCoords);
        
        expect(relRaDecDist(computedRaDec, {relRaDeg: raDec.ra - lst, dec: raDec.dec})).to.be.closeTo(0, 1e-4);
    });

    it("[alt,az] => ALTAZ3D", ()=>{
        const delta = 1e-6;
        
        const zenith = SkyProjection.convertAltAzToALTAZ3D({alt: 90, az: 0});
        expect(dist(zenith, [1,0,0])).to.be.closeTo(0, delta);
        
        const north = SkyProjection.convertAltAzToALTAZ3D({alt: 0, az: 0});
        expect(dist(north, [0,0,1])).to.be.closeTo(0, delta);
        
        const south = SkyProjection.convertAltAzToALTAZ3D({alt: 0, az: 180});
        expect(dist(south, [0,0,-1])).to.be.closeTo(0, delta);
        
        const east = SkyProjection.convertAltAzToALTAZ3D({alt: 0, az: 90});
        expect(dist(east, [0,1,0])).to.be.closeTo(0, delta);
        
        const west = SkyProjection.convertAltAzToALTAZ3D({alt: 0, az: 270});
        expect(dist(west, [0,-1,0])).to.be.closeTo(0, delta);
    });

    it("ALTAZ3D => [alt,az]", ()=>{
        const delta = 1e-6;

        const zenith = SkyProjection.convertALTAZ3DToAltAz([1, 0, 0]);
        expect(zenith.alt).to.be.closeTo(90, delta);
        expect(zenith.az).to.be.gte(0);
        expect(zenith.az).to.be.lt(360);

        const north = SkyProjection.convertALTAZ3DToAltAz([0, 0, 1]);
        expect(north.alt).to.be.closeTo(0, delta);
        expect(north.az).to.be.closeTo(0, delta);

        const south = SkyProjection.convertALTAZ3DToAltAz([0, 0, -1]);
        expect(south.alt).to.be.closeTo(0, delta);
        expect(south.az).to.be.closeTo(180, delta);

        const east = SkyProjection.convertALTAZ3DToAltAz([0, 1, 0]);
        expect(east.alt).to.be.closeTo(0, delta);
        expect(east.az).to.be.closeTo(90, delta);

        const west = SkyProjection.convertALTAZ3DToAltAz([0, -1, 0]);
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
            SkyProjection.rotate(zenith, SkyProjection.rotationsALTAZ3D.toNorth, 90),
            north))
            .to.be.closeTo(0, delta);

        expect(dist(
            SkyProjection.rotate(zenith, SkyProjection.rotationsALTAZ3D.toSouth, 90),
            south))
            .to.be.closeTo(0, delta);

        expect(dist(
            SkyProjection.rotate(north, SkyProjection.rotationsALTAZ3D.toWest, 90),
            west))
            .to.be.closeTo(0, delta);
        expect(dist(
            SkyProjection.rotate(west, SkyProjection.rotationsALTAZ3D.toWest, 90),
            south))
            .to.be.closeTo(0, delta);

        expect(dist(
            SkyProjection.rotate(north, SkyProjection.rotationsALTAZ3D.toEast, 90),
            east))
            .to.be.closeTo(0, delta);
        expect(dist(
            SkyProjection.rotate(south, SkyProjection.rotationsALTAZ3D.toEast, 90),
            west))
            .to.be.closeTo(0, delta);
    });

    it("Apply mount move", ()=> {
        // Just check the quaternion translate from prev to next
        // (the rotation is actually not checked)
        const tests = [
            {
                name: "changing alt",
                axe1: [40,50],
                axe2: [45,50],
            },
            {
                name: "changing az",
                axe1: [0,50],
                axe2: [0,70],
            },
            {
                name: "alt keep west",
                axe1: [45, 0],
                axe2: [50, 0],

                from: [0,90],
                to: [0,90],
            },
            {
                name: "alt keep ~west",
                axe1: [45, 10],
                axe2: [50, 10],

                from: [0,100],
                to: [0,100],
            }
        ];

        for(const test of tests) {
            let fromAltAz = test.from;
            let toAltAz = test.to;

            if (fromAltAz === undefined || toAltAz === undefined) {
                fromAltAz = test.axe1;
                toAltAz = test.axe2;
            }
            
            const quat = SkyProjection.getALTAZ3DMountCorrectionQuaternion(test.axe1, test.axe2);

            const from = SkyProjection.convertAltAzToALTAZ3D({alt: fromAltAz[0], az: fromAltAz[1]});
            const to = SkyProjection.convertAltAzToALTAZ3D({alt: toAltAz[0], az: toAltAz[1]});
            const rslt = quat.rotateVector(from);
            expect(dist(rslt, to)).to.be.closeTo(0, 1e-8, test.name);
        }

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
        expect(dist(thCoords, [coords.ra, coords.dec])).to.be.closeTo(0, raDecDelta, "pixToRaDec");



        const quaternion = skyProj.getIMG3DToEQ3DQuaternion([astrom.width / 2, astrom.height / 2]);
        const centerPt3d = SkyProjection.convertRaDecToEQ3D([coords.ra, coords.dec]);
        // Check the center project back to good pos.
        expect(dist(quaternion.rotateVector([0,0,1]), centerPt3d)).to.be.closeTo(0, delta, "quaternion at center");

        // // Check the north project back to good pos.
        // const topCoords = SkyProjection.convertRaDecToEQ3D(skyProj.pixToRaDec([astrom.width / 2, 0]));
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

        const pixToImage3d = (xy:number[], center:{centerx:number, centery:number})=> {
            const x = (xy[0] - center.centerx) * skyProj.pixelRad;
            const y = (xy[1] - center.centery) * skyProj.pixelRad;
    
            const z3d = 1.0 / Math.sqrt(y * y + x * x + 1.0);
            const x3d = x * z3d;
            const y3d = y * z3d;
            return [x3d, y3d, z3d];
        }

        for(const pos of [ [skyProj.centerx, skyProj.centery], [skyProj.centerx+1000, skyProj.centery], [skyProj.centerx, skyProj.centery+1000] ])
        {

            const quaternionAtRef = skyProj.getIMG3DToEQ3DQuaternion(pos);
            // const refPt3d = SkyProjection.convertRaDecToEQ3D(skyProj.pixToRaDec([skyProj.centerx, skyProj.centery]));
            const refPt3d = skyProj.invertedTransform.convert(pixToImage3d(pos, skyProj));

            const d = dist(quaternionAtRef.rotateVector([0,0,1]), refPt3d);

            expect(dist(quaternionAtRef.rotateVector([0,0,1]), refPt3d)).to.be.closeTo(0, delta, "getIMG3DToEQ3DQuaternion for " + JSON.stringify(pos));

            for(const dlt of [ [1000,1000], [0,1000], [1000, 0], [-1000,0], [0,-1000] ]) {
                // const refPtX = SkyProjection.convertRaDecToEQ3D(skyProj.pixToRaDec([pos[0] + dlt[0], pos[1] + dlt[1]]));
                const refPtX = skyProj.invertedTransform.convert(pixToImage3d([pos[0] + dlt[0], pos[1] + dlt[1]], skyProj));

                const quadPtX = quaternionAtRef.rotateVector(pixToImage3d([pos[0] + dlt[0], pos[1] + dlt[1]], {centerx: pos[0], centery: pos[1]}));
                let dx = dist(quadPtX, refPtX);
                expect(dx / skyProj.pixelRad).to.be.closeTo(0, 2, "For " + JSON.stringify({pos,dlt}));
            }
        }
    });

    it("Basic alz-az with quaternion", ()=> {
        // Equator, with ra = 0 on zenith
        const geoCoords= {lat: 0, long: -341.3335788925829};
        const time = 1557301315714;

        const lst = Map180(SkyProjection.getLocalSideralTime(time, geoCoords.long));
        expect(lst).to.be.closeTo(0, 1e-8);

        // Get the quaternion.
        const nowAndHere = SkyProjection.getEQ3DToALTAZ3DQuaternion(time, geoCoords);

        // From EQ3D to ALTAZ3D
        const expectations  = [
            {
                id: "north",
                eq: [0, 0, 1],
                altaz: [0, 0, 1]
            },
            {
                id: "east",
                eq: [0, 1, 0],
                altaz: [0, 1, 0]
            },
            {
                id: "west",
                eq: [0, -1, 0],
                altaz: [0, -1, 0]
            }
        ];

        for(const e of expectations) {
            const quatProj = nowAndHere.rotateVector(e.eq);
            expect(dist(quatProj, e.altaz)).to.be.closeTo(0, 1e-8, e.id);
        }
    });
    it("converts quaternion to alt/az", ()=> {
        const raDecDelta = 1e-7;
        const pixelDelta = 1e-2;
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

        for(const deltaLat of [ 0, -45, 45, 89 ]) {
            for(const deltaTime of [0, 3, 6, 9, 12]) {

                const geoCoords= {lat: 0 + deltaLat, long: -341.3335788925829};
                const time = 1557301315714 + deltaTime * 3600000;
                const skyProj = SkyProjection.fromAstrometry(astrom);

                // Take the center equatorial quaternion
                // Convert it to alt-az space
                // For various part of the photo:
                //     - convert to alt-az space using quaternion
                //     - convert to RA-DEC=>Alt-AZ->altAz Space
                
                const eqQuaternion = skyProj.getIMG3DToEQ3DQuaternion([astrom.width / 2, astrom.height / 2]);
                const nowAndHere = SkyProjection.getEQ3DToALTAZ3DQuaternion(time, geoCoords);
                
                const photoToAltAz = nowAndHere.mul(eqQuaternion);

                // Various part of the photo
                const pixToImage3d = (relxy:number[])=> {
                    const x = (relxy[0]) * skyProj.pixelRad;
                    const y = (relxy[1]) * skyProj.pixelRad;
            
                    const z3d = 1.0 / Math.sqrt(y * y + x * x + 1.0);
                    const x3d = x * z3d;
                    const y3d = y * z3d;
                    return [x3d, y3d, z3d];
                }

                for(const xy of [[0,0],[2000,0],[0,2000],[2000,2000]]) {
                
                    const centerByQuaternion = photoToAltAz.rotateVector(pixToImage3d(xy));
                    const centerByMatrix = SkyProjection.convertAltAzToALTAZ3D(
                                                SkyProjection.lstRelRaDecToAltAz(
                                                    SkyProjection.raDecToLstRel(
                                                        skyProj.pixToRaDec([astrom.width / 2 + xy[0], astrom.height / 2 + xy[1]]),
                                                        time,
                                                        geoCoords,
                                                    ),
                                                    geoCoords
                                                )
                                            );
                    const delta = 0.01 + norm(xy) * 0.005;
                    expect(dist(centerByQuaternion, centerByMatrix)/skyProj.pixelRad)
                        .to.be.closeTo(0, delta, "For " + JSON.stringify({
                            deltaLat,
                            deltaTime,
                            xy
                        }));
                }
            }
        }
    });

    it("Has coherent atmospheric refraction model", ()=> {
        const az = 0;
        let maxDelta = 0.5;
        let minDelta = 0.4;
        for(let alt =0; alt <= 90; alt++) {
            const corrected = SkyProjection.altAzCancelRefraction({alt, az})
            expect(corrected.az).to.equal(az);
            expect(corrected.alt).to.be.gte(alt-0.000001);
            const delta = corrected.alt - alt;

            expect(delta).to.be.gte(minDelta-0.000001);
            expect(delta).to.be.lte(maxDelta);
            maxDelta = delta;
            minDelta /= 2;
        }
    });
});

