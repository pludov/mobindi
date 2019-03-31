import MemoryStreams from 'memory-streams';
import CancellationToken from 'cancellationtoken';

import {ProcessorRequest} from './shared/ProcessorTypes';
import { BackofficeStatus } from './shared/BackOfficeStatus';
import JsonProxy from './JsonProxy';
import { AppContext } from './ModuleBase';
import { Pipe } from './SystemPromise';


export default class ImageProcessor
{
    readonly appStateManager:JsonProxy<BackofficeStatus>;
    readonly context:AppContext;

    constructor(appStateManager:any, context:AppContext) {
        this.appStateManager = appStateManager;
        this.context = context;
    }

    async compute(ct: CancellationToken, jsonRequest: ProcessorRequest):Promise<any> {
        const result = await Pipe(ct,
            {
                command: ["./fitsviewer/processor"]
            },
            new MemoryStreams.ReadableStream(JSON.stringify(jsonRequest))
        );

        return JSON.parse(result);
    }

    async $api_compute(ct: CancellationToken, jsonRequest: any) {
        return await this.compute(ct, jsonRequest.details);
    }
}
