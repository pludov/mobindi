// Type definition for metrics scraping

export type Definition = {
    name: string;
    help?: string|undefined;
    type?: "gauge"|"untyped"|"counter"|undefined;
    value?: number;
    labels?: {[id:string]: string};
};


export function format(metrics: Definition[]) {
    let ret: string[] = [];
    for(const metric of metrics) {
        if (metric.help) {
            ret.push(`# HELP ${metric.name} ${metric.help}\n`);
        }

        if (metric.type) {
            ret.push(`# TYPE ${metric.name} ${metric.type}\n`);
        }

        if (Object.prototype.hasOwnProperty.call(metric, 'value')) {
            let v = metric.value;
            if (v === undefined) {
                v = NaN;
            }

            let labelObj = metric.labels || {};
            let labels:string[] = [];
            for(const key of Object.keys(labelObj)) {
                labels.push(`${key}=${JSON.stringify(labelObj[key])}`);
            }
            const labelStr = labels.length ? `{${labels.join(',')}}` : '';
            ret.push(`${metric.name}${labelStr} ${v}\n`);
        }
    }

    return ret.join('');

}