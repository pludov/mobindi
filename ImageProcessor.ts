import MemoryStreams from 'memory-streams';
import CancellationToken from 'cancellationtoken';

import * as ProcessorTypes from './shared/ProcessorTypes';
import { BackofficeStatus } from './shared/BackOfficeStatus';
import JsonProxy from './JsonProxy';
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

    getAPI() {
        return {
            compute: this.compute
        }
    }
}
