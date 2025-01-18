
export function deltaTitle(dlt:number) {
    dlt = Math.round(dlt * 3600);

    // We always want at least 3 significant digits, but not under arcseconds
    if (dlt === 0) {
        return '0"';
    }

    let rslt;
    let pad = 0;
    if (dlt < 0) {
        rslt = '-';
        dlt = -dlt;
    } else {
        rslt = '+';
    }

    if (dlt >= 3600) {
        rslt += Math.floor(dlt / 3600).toString() + '°';
        pad = 1;
    }

    if (dlt >= 60 && dlt < 100*3600) {
        rslt += (Math.floor(dlt / 60) % 60).toString().padStart(pad * 2, '0') + "'";
        pad = 1;
    }

    // We get rid of seconds, only if minutes is above 60
    if (dlt < 3600) {
        rslt += (dlt % 60).toString().padStart(pad * 2, '0') + '"';
    }
    return rslt;
}