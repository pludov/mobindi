import { canonicalize } from 'json-canonicalize';

import { SequenceStepParameters } from '@bo/BackOfficeStatus';

type RecursiveMapEntry = {order: number, value: any, childs?: RecursiveMap};
type RecursiveMap = Map<any, RecursiveMapEntry>;

/* Decide split points for deciding sets of parameters */
export type ExposureSettingsPriority = {
    [P in keyof SequenceStepParameters]?: number|null;
}

export class SequenceParamClassifier {
    readonly exposureParamPriority: ExposureSettingsPriority = {
        type: 0,
        exposure: 1,
        filter: 2,
        bin: 3,
        iso: 4,
        dithering: null,
        focuser: null,
    };

    readonly exposureParamsOrdered: Array<keyof ExposureSettingsPriority>;
    // Successives keys are exposureParamsOrdered
    readonly rootMap : RecursiveMap = new Map();
    private nextOrder: number = 0;

    constructor() {
        this.exposureParamsOrdered=
            (Object.keys(this.exposureParamPriority) as Array<keyof ExposureSettingsPriority>)
                    .filter((e)=>(this.exposureParamPriority[e]!==null))
                    .sort((a, b)=>(this.exposureParamPriority[a]! - this.exposureParamPriority[b]!));
    }

    addParameter=(c : SequenceStepParameters)=>
    {
        const add=(c : SequenceStepParameters, pid: number, map: RecursiveMap)=>{
            const params = this.exposureParamsOrdered[pid];
            const value = c[params];
            const last = pid + 1 === this.exposureParamsOrdered.length;

            if (last) {
                map.set(value, {value, order: this.nextOrder++});
            } else {
                let childMap = map.get(value);
                if (!childMap) {
                    childMap = {
                        value,
                        order: this.nextOrder++,
                        childs: new Map()
                    }
                    map.set(value, childMap);
                }

                add(c, pid + 1, childMap.childs!);
            }
        }

        add(c, 0, this.rootMap);
    }

    extractParameters=()=>
    {
        let result : Array<SequenceStepParameters&{order:number}> = [];
        const split=(cur: SequenceStepParameters, map : RecursiveMap, pid: number)=>{
            const singleMap = map.size === 1;

            for(const entry of Array.from(map.values()).sort((a, b)=>(a.order - b.order)))
            {
                if (!entry.childs) {
                    result.push({...cur, order: entry.order});
                } else if (singleMap) {
                    split(cur, entry.childs, pid + 1);
                } else {
                    const newCur = {...cur};
                    if (entry.value !== undefined) {
                        newCur[this.exposureParamsOrdered[pid]] = entry.value;
                    } else {
                        delete newCur[this.exposureParamsOrdered[pid]];
                    }
                    split(newCur, entry.childs, pid + 1);
                }
            }
        }

        split({}, this.rootMap, 0);

        result.sort((a,b)=>a.order - b.order);

        return result.map(e=>{
            const {order, ...param} = e;
            return param;
        });
    }

    extractJcsIdForParameters=(e: SequenceStepParameters) : string=>
    {
        const result: SequenceStepParameters = {};
        let failed = false;
        const scan=(map : RecursiveMap, pid: number)=>{
            const singleMap = map.size === 1;
            const key = this.exposureParamsOrdered[pid];
            const value = e[key];

            if (!map.has(value)) {
                failed = true;
                return;
            }

            const next = map.get(value)!;

            if (!singleMap) {
                (result as any)[key] = value;
            }

            if (next.childs) {
                scan(next.childs, pid+1);
            }

        }

        scan(this.rootMap, 0);
        return canonicalize(result);
    }
}
