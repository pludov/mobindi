import "source-map-support/register";
import * as assert from 'assert';
import 'mocha';
import { expect } from 'chai';
import PolarAlignmentWizard from "./PolarAlignmentWizard";
import SkyProjection from "./SkyAlgorithms/SkyProjection";
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

    let latfactor = 0;

    it("altitude is stable during azimuth only move", () => {
        // 2025-01-11T17:56:14.901Z
        const axis = {
            alt: 48.085878900709695,
            az: 0.7475027980451935,
            tooEast: 0.7475027980451935,
            tooHigh: 0.0025789007096932437,
            distance: 0.24968051457126753
        }
        const ref = {
            astrometry: {
              cd1_1: 0.000528054905258,
              cd1_2: 0.00125778235081,
              cd2_1: -0.00125827122628,
              cd2_2: 0.000525782242973,
              decCenter: 1.14498252119,
              found: true,
              height: 1410,
              raCenter: 46.7390323198,
              refPixX: 393.877548218,
              refPixY: 911.506774902,
              width: 2072
            },
            photoTime: 1736618405678,
            geoCoords: { lat: 48.0833, long: -1.6833 },
            frameType: 'reference',
            takeRefFrame: true
          };
          // 2025-01-11T18:04:08.385Z
          const last = {
            astrometry: {
              cd1_1: 0.000537380782757,
              cd1_2: 0.00125483034596,
              cd2_1: -0.00125530164647,
              cd2_2: 0.000536694600305,
              decCenter: 0.340027676074,
              found: true,
              height: 1410,
              raCenter: 47.6138089254,
              refPixX: 1191.78471883,
              refPixY: 845.717610677,
              width: 2072
            },
            photoTime: 1736618645870.5,
            geoCoords: { lat: 48.0833, long: -1.6833 },
            frameType: 'adjustment',
            takeRefFrame: false
          };

          let badAxisAtRefAltAz = {alt: axis!.alt, az: axis!.az};
          let newAxisLastAltAz;
          let refALTAZ3D;
          {
              let { raDecDegNow, quatALTAZ3D } = PolarAlignmentWizard.centerFromAstrometry(ref.astrometry as any, ref.photoTime!, ref.geoCoords);
  
              const ALTAZ3Dvec =quatALTAZ3D.rotateVector([0,0,1]);
              console.log(ALTAZ3Dvec);
  
              refALTAZ3D = quatALTAZ3D;
          }

          {
              const photoTrackSinceRef = last.photoTime! - ref.photoTime!;
              let { raDecDegNow, quatALTAZ3D } = PolarAlignmentWizard.centerFromAstrometry(last.astrometry as any, last.photoTime!, last.geoCoords);
  
              const ALTAZ3Dvec =quatALTAZ3D.rotateVector([0,0,1]);
              console.log(ALTAZ3Dvec);
              console.log(photoTrackSinceRef);
              // TODO: on perd des secondes de tracking ?
              newAxisLastAltAz = PolarAlignmentWizard.updateAxis(badAxisAtRefAltAz, refALTAZ3D!, quatALTAZ3D, photoTrackSinceRef);
  
              console.log(PolarAlignmentWizard.computeAxis(newAxisLastAltAz, ref.geoCoords));
          }

          expect(newAxisLastAltAz.alt, "dlt(alt)").to.be.closeTo(axis.alt, 2/60);
          expect(newAxisLastAltAz.az, "dlt(az)").to.be.closeTo(0, 2/60);

    });

    it("azimuth is stable during altitude only move", ()=> {
        // This was taken during on a session 2025-05-07.
        const axis = {
            alt: 47.51995993981953,
            az: 0.3314078978606421,
            tooEast: 0.3314078978606421,
            tooHigh: -0.563340060180451,
            distance: 0.30286290469054356
        };
        
        const ref = {
            astrometry: {
              cd1_1: -0.000275926333108,
              cd1_2: -0.000623371540494,
              cd2_1: 0.000623063188548,
              cd2_2: -0.000277135676234,
              decCenter: 30.2427939912,
              found: true,
              height: 2822,
              raCenter: 104.073723246,
              refPixX: 1239.15649923,
              refPixY: 2009.9148763,
              width: 4144
            },
            photoTime: 1736196696837,
            geoCoords: { lat: 48.0833 + latfactor, long: -1.6833 },
            frameType: 'reference',
            takeRefFrame: true,
        };
        const last = {
            astrometry: {
                cd1_1: -0.000244498379067,
                cd1_2: -0.000636357907356,
                cd2_1: 0.000636031707964,
                cd2_2: -0.000244908438529,
                decCenter: 32.686367671,
                found: true,
                height: 2822,
                raCenter: 105.835705383,
                refPixX: 1081.99296061,
                refPixY: 1581.31424205,
                width: 4144
            },
            photoTime: 1736196958734,
            geoCoords: { lat: 48.0833 + latfactor, long: -1.6833 },
            frameType: 'adjustment',
            takeRefFrame: false,
        };
        let badAxisAtRefAltAz = {alt: axis!.alt, az: axis!.az};
        let newAxisLastAltAz;
        let refALTAZ3D;
        {
            let { raDecDegNow, quatALTAZ3D } = PolarAlignmentWizard.centerFromAstrometry(ref.astrometry as any, ref.photoTime!, ref.geoCoords);

            const ALTAZ3Dvec =quatALTAZ3D.rotateVector([0,0,1]);
            console.log(ALTAZ3Dvec);

            refALTAZ3D = quatALTAZ3D;
        }

        {
            const photoTrackSinceRef = last.photoTime! - ref.photoTime!;
            let { raDecDegNow, quatALTAZ3D } = PolarAlignmentWizard.centerFromAstrometry(last.astrometry as any, last.photoTime!, last.geoCoords);

            const ALTAZ3Dvec =quatALTAZ3D.rotateVector([0,0,1]);
            console.log(ALTAZ3Dvec);
            console.log(photoTrackSinceRef);
            // TODO: on perd des secondes de tracking ?
            newAxisLastAltAz = PolarAlignmentWizard.updateAxis(badAxisAtRefAltAz, refALTAZ3D!, quatALTAZ3D, photoTrackSinceRef);

            console.log(PolarAlignmentWizard.computeAxis(newAxisLastAltAz, ref.geoCoords));


        }

        // Precision is bad here, probably because the location on sky was imprecise.
        expect(newAxisLastAltAz.az, "az move").to.be.closeTo(axis.az, 40/60);

        expect(newAxisLastAltAz.alt, "alt < -3").to.be.below(axis.alt - 3);
        expect(newAxisLastAltAz.alt, "alt > -4").to.be.above(axis.alt - 4);

    });


    it("Compute valid ra travel range for Vega (east)", ()=>{
        const ret = PolarAlignmentWizard.computeRaRange(
            home, vega, testEpoch,
            {
                angle: 90,
                minAltitude: 10,    // Don't descend under this alt
            });
        expect(ret.end).to.eq(0);
        expect(ret.start).to.be.closeTo(6, 1/15);
    });
    it("Compute valid ra travel range for Arcturus (west)", ()=>{
        const ret = PolarAlignmentWizard.computeRaRange(
            home, arcturus, testEpoch,
            {
                angle: 90,
                minAltitude: 10,    // Don't descend under this alt
            });
        expect(ret.end).to.eq(0);
        expect(ret.start).to.be.closeTo(-6, 1/15);
    });
    it("Compute valid ra travel range for Antares (south/west)", ()=>{
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

    it("Compute valid alignment plane", ()=> {
        // const datas = [
        //     {"relRaDeg":-59.212633540939514,"dec":49.89604627577142},
        //     {"relRaDeg":-51.84628305565788, "dec":49.78786923169254},
        //     {"relRaDeg":-43.729316608951045,"dec":49.971556957187175},
        //     {"relRaDeg":-35.061178114742326,"dec":49.90679081607341},
        //     {"relRaDeg":-26.063223144905127,"dec":49.74583834204954},
        //     {"relRaDeg":-18.049092142107593,"dec":49.85757807208},
        //     {"relRaDeg":-9.046974973164792,"dec":49.95474247592739},
        //     {"relRaDeg":-0.9145862753303224,"dec":49.90337636796449}
        // ];

        // const datas = [
        //     {"relRaDeg":74.7282698235827,"dec":49.976706091044036},
        //     {"relRaDeg":68.65118067606893,"dec":49.84188144558144},
        //     {"relRaDeg":62.27878626954883,"dec":49.90244673204468},
        //     {"relRaDeg":55.00335461185429,"dec":49.98773944756015},
        //     {"relRaDeg":48.27014527967901,"dec":50.02454129658837},
        //     {"relRaDeg":41.7144294981653,"dec":49.96174703348936},
        //     {"relRaDeg":34.85470777863771,"dec":50.043175298997205},
        //     {"relRaDeg":27.688142491315986,"dec":49.99284576149799},
        //     {"relRaDeg":20.922286110409683,"dec":49.896679528636625},
        //     {"relRaDeg":14.238893484181737,"dec":49.947309771219636},
        //     {"relRaDeg":7.35093870777574,"dec":49.822948189379005},
        //     {"relRaDeg":1.0839780351354666,"dec":49.916751062166846}
        // ];

        // const datas = [
        //     {"relRaDeg":-74.27421225412418,"dec":16.391126611748},
        //     {"relRaDeg":-68.51636759221832,"dec":16.58667219906043},
        //     {"relRaDeg":-62.188445276692306,"dec":16.49156114927965},
        //     {"relRaDeg":-55.24600135390073,"dec":16.56362580368776},
        //     {"relRaDeg":-48.329521664425414,"dec":16.59474944106824},
        //     {"relRaDeg":-41.556201323912695,"dec":16.469293773953627},
        //     {"relRaDeg":-34.461231771483384,"dec":16.537980007537858},
        //     {"relRaDeg":-14.45721619026042,"dec":16.475665879537836},
        //     {"relRaDeg":-7.523476697344583,"dec":16.534495006329134},
        //     {"relRaDeg":-0.6753801326112208,"dec":16.426447493250606}
        // ]

        const datas = [
            {"relRaDeg":-74.5090150640801,"dec":16.557861895032843},
            {"relRaDeg":-72.57084809432811,"dec":16.429013935533153},
            {"relRaDeg":-69.41526642003252,"dec":16.66823221139633},
            {"relRaDeg":-66.2710108931575,"dec":16.611336046423425},
            {"relRaDeg":-62.950251839580076,"dec":16.35902838052307},
            {"relRaDeg":-59.970690867248905,"dec":16.563283091963935},
            {"relRaDeg":-56.686073038455625,"dec":16.58785327475167},
            {"relRaDeg":-53.713071775994024,"dec":16.498322330182404},
            {"relRaDeg":-50.45462827121092,"dec":16.502111393761187},
            {"relRaDeg":-47.21920503988904,"dec":16.59483253871824},
            {"relRaDeg":-44.19349759361316,"dec":16.6563404719363},
            {"relRaDeg":-41.05627073224441,"dec":16.586088166400188},
            {"relRaDeg":-29.15951467998729,"dec":16.588011475998858},
            {"relRaDeg":-25.899105063739206,"dec":16.534458989211284},
            {"relRaDeg":-22.675619723324893,"dec":16.569123684290883},
            {"relRaDeg":-19.650781373913773,"dec":16.46288063631458},
            {"relRaDeg":-13.24689355162294,"dec":16.475678816851207},
            {"relRaDeg":-6.885876634317098,"dec":16.4358750153873},
            {"relRaDeg":-3.784698468903731,"dec":16.505720531312313}
        ];

        const result = PolarAlignmentWizard.findMountAxis(datas);
        expect(result.relRaDeg).to.be.closeTo(133.92366644141057, 1/60);
        expect(result.dec).to.be.closeTo(89.58846174546814, 1/60);

        console.log('result is ', result);
        console.log('Distance (°): ', SkyProjection.getDegreeDistance([0, 90], [result.relRaDeg, result.dec]));
    });

    it("compute alt/az delta", ()=> {
        const mountAxis = {"relRaDeg":37.01493070502396,"dec":89.7378684725588 };
        const geoCoords = {lat: 48.0833, long: 1.4 };
        const mountAxisAltAz = SkyProjection.lstRelRaDecToAltAz(mountAxis, geoCoords);

        const axis = PolarAlignmentWizard.computeAxis(mountAxisAltAz, geoCoords);
        expect(axis.alt).to.equal(mountAxisAltAz.alt);
        expect(axis.az).to.equal(mountAxisAltAz.az);

        // Check plausible
        expect(axis.tooEast).to.be.closeTo(0, 1);
        expect(axis.tooHigh).to.be.closeTo(0, 1);
        expect(axis.distance).to.be.closeTo(0, 1);

        // Check result
        console.log('axis is ', axis);
    });

    it("report axis move", ()=> {

        const tests = [
            {
                name: "obvious az change",
                refFrame: {alt: 0, az:0},
                newFrame: {alt: 0, az: 2},
                initialAxis: {alt:90, az: 60},
                newAxis: {alt: 90, az: 62},
                tracked: 0,
            },
            {
                name: "equator alt change",
                refFrame: {alt: 0, az:0},
                newFrame: {alt: 0.5, az:0},
                initialAxis: {alt:40, az: 0},
                newAxis: {alt: 40.5, az: 0},
                tracked: 0,
            },
            {
                name: "obvious alt change",
                refFrame: {alt: 0, az:0},
                newFrame: {alt: 1, az: 0},
                initialAxis: {alt:40, az: 0},
                newAxis: {alt: 41, az: 0},
                tracked: 0,
            },
            // {
            //     name: "lat45° az change",
            //     refFrame: {alt: 40, az: 30},
            //     newFrame: {alt: 40, az: 32},
            //     initialAxis: {alt:40, az: 4},
            //     newAxis: {alt: 40, az: 6},
            //     tracked: 0,
            // },
            {
                name: "equator track with good align",
                refFrame: {alt: 40, az: 90}, //East
                newFrame: {alt: 50, az: 90},
                initialAxis: {alt:0, az: 0},
                newAxis: {alt: 0, az: 0},
                tracked: SkyProjection.SIDERAL_DAY_MS * 10 / 360,
            },
            // This one is ko due to zenith
            // {
            //     name: "equator track and move with good align",
            //     refFrame: {alt: 80, az: 90}, //East
            //     newFrame: {alt: 80, az: 180}, // Now south (tracked led to zenith)
            //     initialAxis: {alt:0, az: 0},
            //     newAxis: {alt: 10, az: 0},
            //     tracked: SkyProjection.SIDERAL_DAY_MS * 10 / 360,
            // }
        ];
        let id = 0;
        for(const test of tests) {
            id++;
            const testName=`${test.name} (#${id})`;
            
            // const newFrameQuaternion = Quaternion.fromBetweenVectors([0,0,1], SkyProjection.convertAltAzToALTAZ3D(test.newFrame));
            
            const mountCorrection = SkyProjection.getALTAZ3DMountCorrectionQuaternion(
                            [test.initialAxis.alt, test.initialAxis.az],
                            [test.newAxis.alt, test.newAxis.az]
            );

            let refFrameQuaternion = Quaternion.fromBetweenVectors([0,0,1], SkyProjection.convertAltAzToALTAZ3D(test.refFrame));
            
            const tracking = Quaternion.fromAxisAngle(SkyProjection.convertAltAzToALTAZ3D(test.initialAxis), -test.tracked * 2 * Math.PI /SkyProjection.SIDERAL_DAY_MS);
            const refFrameQuaternionTracked = tracking.mul(refFrameQuaternion);
            
            const newFrameQuaternion = mountCorrection.mul(refFrameQuaternionTracked);

            const newFrameExpectedCenter = SkyProjection.convertAltAzToALTAZ3D(test.newFrame);

            const newFrameComputedCenter = newFrameQuaternion.rotateVector([0,0,1]);
            const newFrameAltAz = SkyProjection.convertALTAZ3DToAltAz(newFrameComputedCenter);
            expect(dist(newFrameComputedCenter , newFrameExpectedCenter)).to.be.closeTo(0, 6.28 / (360*3600), "new frame mapped back for " + testName);


            // const refFrameQuaternion = SkyProjection.getALTAZ3DMountCorrectionQuaternion([test.refFrame.alt, test.refFrame.az], [test.newFrame.alt, test.newFrame.az]);
            // const newFrameQuaternion = SkyProjection.getEQ3DQuaternion([test.newFrame.az, test.newFrame.alt]);

            const newAxis = PolarAlignmentWizard.updateAxis(test.initialAxis, refFrameQuaternion, newFrameQuaternion, test.tracked);
            expect(SkyProjection.getDegreeDistanceAltAz(newAxis, test.newAxis)).to.be.closeTo(0, 1/3600, testName);
        }
    });

    it("Can mock RA/DEC", ()=> {
        const delta = 1e-5;
        const geoloc = {lat: hms(48, 6, 8.28), long: -hms(1,47,50)};
        const testTime = new Date("2019-05-03T20:14:40.000Z").getTime();
        // (Errai)
        const coords = [ 15 * hms(23,40,12.54) , hms(77,44,31.2) ];

        const tooEast = PolarAlignmentWizard.mockRaDecDegNow(coords, testTime, geoloc, {tooEast: 1.0, tooHigh: 0});
        const tooEastTarget = [ 351.2645785319827, 77.85628748524624 ];

        expect(dist(tooEastTarget, tooEast)).to.be.closeTo(0, delta);

        const tooLow = PolarAlignmentWizard.mockRaDecDegNow(coords, testTime, geoloc, {tooEast: 0.0, tooHigh: -1})
        const tooLowTarget = [ 354.1853182560304, 76.7613936362115 ];

        expect(dist(tooLowTarget, tooLow)).to.be.closeTo(0, delta);
    });

    it("Includes atmospheric refraction", ()=> {
        const rawData = JSON.parse(fs.readFileSync("PolarAlignmentWizard.test.json", "utf-8")).session1;

        const data = rawData.samples.map((e:any)=>PolarAlignmentWizard.dataFromSamplingResult(e.astrometry, e.photoTime, e.geoCoords));

        const mountAxis = PolarAlignmentWizard.findMountAxis(data);

        const geoCoords = rawData.samples[0].geoCoords;

        const altAzMountAxis = SkyProjection.lstRelRaDecToAltAz(mountAxis, geoCoords);
        const axis = PolarAlignmentWizard.computeAxis(altAzMountAxis, geoCoords);

        expect(3600 * dist([0.2097, 0.1916], [axis.tooEast, axis.tooHigh])).to.be.closeTo(0, 10);
    });
});
