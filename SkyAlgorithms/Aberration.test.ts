import * as assert from 'assert';
import 'mocha';
import { expect } from 'chai';
import Aberration from "./Aberration";
import SkyProjection from "./SkyProjection";


describe("Aberration", ()=> {

    it("Compute correct value for one example", ()=>{
        const jd = SkyProjection.JDEpoch(new Date("2028-11-13T04:31:00Z").getTime());

        const input_pos = {
            ra: 15 * (2 + 44 / 60 + 12.9747 / 3600), // RA in degrees
            dec: 49 + 13 / 60 + 39.896 / 3600 // DEC in degrees
        }

        const expected = {
            ra: 41.06238352, // Expected RA aberration in degrees
            dec: 49.22962359 // Expected DEC aberration in degrees
        }

        const result = Aberration.getEquatorialAberration(input_pos, jd);

        console.log('Input Position:', input_pos);
        console.log('Expected Result:', expected);
        console.log('Result:', result);
        console.log('Delta:', {
            ra: Math.abs(result.ra - expected.ra),
            dec: Math.abs(result.dec - expected.dec)
        });

        expect(result.ra).to.be.closeTo(expected.ra, 0.01/3600);
        expect(result.dec).to.be.closeTo(expected.dec, 0.01/3600);
    })

    it("Compute inverse aberration", ()=>{
        const jd2 = SkyProjection.JDEpoch(new Date("2028-04-13T04:31:00Z").getTime());
        let ctrlSum = 0;
        
        let errors: number[] = [];
        for(let ra = 0; ra < 360; ra += 5) { 
          for(let dec = -89 ; dec <= 89; dec += (Math.abs(dec) < 89 ? 1 : 0.002)) {
              // Check the inverse operation returns the initial position
        
              const original = {
                  ra, dec
              };
              
              const corrected = Aberration.getEquatorialAberration(original, jd2);
              
              
              const reversed = Aberration.cancelEquatorialAberration(corrected, jd2);

              const dst = SkyProjection.getDegreeDistance([original.ra, original.dec], [reversed.ra, reversed.dec]);
              if (dst > 1e-8) {
                console.log('Delta:', {
                    poq: original,
                    ra: Math.abs(original.ra - reversed.ra),
                    dec: Math.abs(original.dec - reversed.dec),
                    dst,
                    dst_s: dst*3600,
                });
        
              }
        
        
              errors.push(dst*3600);
              ctrlSum += dst * 3600;
            }
        }
        
        errors.sort((a, b) => a - b);
        
        let errorSum = 0;
        for(const error of errors) {
            errorSum += error;
        }
        console.log('Error sum : ', errorSum, ctrlSum);
        console.log('Errors count:', errors.length);
        console.log('Min error:', errors[0]);
        console.log('Mean error:', errorSum / errors.length);
        console.log('Max error:', errors[errors.length - 1]);
        expect(errors[errors.length - 1]).to.be.lessThan(0.01, "Max error should be less than 0.01 arcsec");
        expect(errorSum / errors.length).to.be.lessThan(0.001, "Mean error should be less than 0.01 arcsec");
    });
});