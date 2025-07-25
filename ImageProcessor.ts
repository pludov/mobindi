import MemoryStreams from 'memory-streams';
import CancellationToken from 'cancellationtoken';

import * as ProcessorTypes from './shared/ProcessorTypes';
import { BackofficeStatus } from './shared/BackOfficeStatus';
import JsonProxy from './shared/JsonProxy';
import { AppContext } from './ModuleBase';
import { Pipe } from './SystemPromise';
import * as RequestHandler from "./RequestHandler";
import * as BackOfficeAPI from "./shared/BackOfficeAPI";


export default class ImageProcessor
            implements RequestHandler.APIAppProvider<BackOfficeAPI.ImageProcessorAPI>
{
    readonly appStateManager:JsonProxy<BackofficeStatus>;
    readonly context:AppContext;

    constructor(appStateManager:any, context:AppContext) {
        this.appStateManager = appStateManager;
        this.context = context;
    }

    compute = async <K extends keyof ProcessorTypes.Request>
            (
                ct: CancellationToken,
                payload: Pick<ProcessorTypes.Request, K>
            ):Promise<ProcessorTypes.Result[K]>=>
    {
        // Options are within up to there, to allow TS typing.
        const payloadWithTopLevelOptions:any = {...payload};
        for(const o of Object.keys(payload)) {
            if (Object.prototype.hasOwnProperty.call(payloadWithTopLevelOptions[o], "options")) {
                const {options, ...rest} = payloadWithTopLevelOptions[o];
                payloadWithTopLevelOptions[o] = rest;
                payloadWithTopLevelOptions.options = options;
            }
        }

        const result = await Pipe(ct,
            {
                command: ["./fitsviewer/processor"]
            },
            new MemoryStreams.ReadableStream(JSON.stringify(payloadWithTopLevelOptions))
        );

        return JSON.parse(result);
    }

    // Find the first ADU value that has at level (0-1) adus
    static getHistgramAduLevel(channel: ProcessorTypes.ProcessorHistogramChannel, level:number):number {
        const seuil = level * channel.pixcount;
        let pos = undefined;
        for(let i = 0 ; i < channel.data.length; ++i) {
            if (channel.data[i] >= seuil) {
                pos = i;
                break;
            }
        }
        if (pos === undefined) {
            return channel.max;
        } else {
            return channel.min + pos;
        }
    }

    // Return a weighted mean of the ADU values between two levels. level1 is inclusive, level2 is exclusive.
    static getHistogramAduLevelMean(channel: ProcessorTypes.ProcessorHistogramChannel, level1: number, level2: number):number {
        const seuil1 = level1 * channel.pixcount;
        const seuil2 = level2 * channel.pixcount;
        if (seuil1 > seuil2) {
            throw new Error("Invalid levels: level1 must be less than level2");
        }
        let weight_mean = 0;
        let weight_count = 0;
        let mean = 0;
        let count = 0;

        let prev = 0;

        for(let i = 0 ; i < channel.data.length; ++i) {
            const current = channel.data[i];
            if (current >= seuil1 && prev <= seuil2) {
                const x0 = Math.max(seuil1, prev);
                const x1 = Math.min(seuil2, current);
                const samples = x1 - x0;
                weight_mean += samples * i;
                weight_count += samples;
                mean += i;
                count ++;
            }
            prev = channel.data[i];

            if (channel.data[i] > seuil2) {
                break;
            }
        }

        if (weight_count !== 0) {
            return channel.min + weight_mean / weight_count;
        } else if (count !== 0) {
            return channel.min + mean / count;
        } else {
            // Will not work for degenerate cases
            return channel.max;
        }
    }


    getAPI() {
        return {
            compute: this.compute
        }
    }
}
