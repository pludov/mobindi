import {PhdGuideStep, PhdGuideStats} from '@bo/BackOfficeStatus';


export function computeGuideStats(steps:Array<PhdGuideStep>):PhdGuideStats
{
    // calcul RMS et RMS ad/dec
    let rms = [0, 0];
    let keys:Array<keyof PhdGuideStep> = ['RADistance', 'DECDistance']
    let maxs = [0, 0, 0];
    let count = 0;

    let allVals : Array<Array<number>> = [[],[],[]];

    for(const step of steps)
    {
        const vals = [];
        for(const key of keys) {
            if (step[key] !== null && step[key] !== undefined) {
                vals.push(step[key] as number);
            }
        }
        if (vals.length == keys.length) {
            vals.push(Math.sqrt(vals.reduce((acc, v)=>(acc+v*v), 0)));
            for(let i = 0; i <vals.length; ++i) {
                allVals[i].push(vals[i]);
            }
        }
    }

    for(let i = 0; i < allVals.length; i++) {
        const vals:number[] = allVals[i];

        const sz = vals.length;
        const sumYSq = vals.map(e=>e*e).reduce((acc, v)=>(acc + v), 0);
        const sumY = vals.reduce((acc, v)=>(acc + v), 0)
        const max = vals.reduce((acc, v)=>(Math.abs(v)>acc ? Math.abs(v):acc), 0);

        rms[i] = Math.sqrt((sz * sumYSq - sumY * sumY) / (sz * sz));
        maxs[i] = max;

        count = Math.max(count, sz);
    }

    function calcPeak(val:number, div:number)
    {
        if (div == 0) {
            return null;
        }
        return val;
    }

    if (count) {
        // FIXME: this is wrong. The variance of the 2D distance is considerably lower
        rms[2] = Math.sqrt(rms[0]*rms[0] + rms[1]*rms[1]);
    }

    return {
        RADistanceRMS: rms[0],
        DECDistanceRMS: rms[1],
        RADECDistanceRMS: rms[2],
        RADistancePeak: calcPeak(maxs[0], count),
        DECDistancePeak: calcPeak(maxs[1], count),
        RADECDistancePeak: calcPeak(maxs[2], count),
    }
}
