export function mean(values: number[]) {
    let s = 0;
    for(let i = 0; i < values.length; ++i) {
        s += values[i];
    }
    return s/values.length;
}

export function kapaFilteredMean(values: number[], sigma:number, iter:number) {
    if (values.length === 0) return NaN;
    for(let i = 0; i < iter; ++i) {
        let moy = mean(values);
        const stddev = Math.sqrt(values.reduce((c, s)=>c + (s - moy)*(s - moy), 0) / values.length);
        const stddevSeuil = sigma * stddev;

        const newValues = values.filter(s=>Math.abs(s - moy) < stddevSeuil);
        if (newValues.length === values.length) {
            return moy;
        }
        if (newValues.length === 0) {
            return moy;
        }
        values = newValues;
    }
    return mean(values);
}


// Compute global FWHM for a starfield, excluding saturated stars and outliers
// Return NaN if impossible (no unsaturated star)
export function starFieldFwhm(stars: Array<{fwhm: number, peak:number}>) {
    stars = stars.filter(star=>star.peak < 0.9);
    return kapaFilteredMean(stars.map(star=>star.fwhm), 5, 1.5);
}