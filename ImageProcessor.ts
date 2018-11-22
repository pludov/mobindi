import MemoryStreams from 'memory-streams';
import * as Promises from './Promises';
import * as SystemPromises from './SystemPromises';

import {ProcessorRequest} from './shared/ProcessorTypes';
import JsonProxy from './JsonProxy';
import { BackofficeStatus } from './shared/BackOfficeStatus';
import { AppContext } from './ModuleBase';


// Ugggglyyy fix for end of stream
MemoryStreams.ReadableStream.prototype._read = function(n) {
    const self : any = this;
    this.push(self._data);
    self._data = null;
  };

export default class ImageProcessor
{
    readonly appStateManager:JsonProxy<BackofficeStatus>;
    readonly context:AppContext;

    constructor(appStateManager:any, context:AppContext) {
        this.appStateManager = appStateManager;
        this.context = context;
    }

    compute(jsonRequest: ProcessorRequest):Promises.Cancelable<void, any> {
        let writableStream: MemoryStreams.WritableStream;
        let writableStreamDone: boolean = false;
        let writableStreamCb:undefined|(()=>(void));

        function captureDone()
        {
            writableStreamDone = true;
            if (writableStreamCb) {
                writableStreamCb();
            }
        }
        return new Promises.Chain(
            new Promises.Immediate(() => {
                writableStream = new MemoryStreams.WritableStream();
                writableStreamCb = undefined;
                writableStreamDone = false;
                writableStream.on('finish', ()=> {
                    captureDone();
                });
            }),
            new SystemPromises.Exec(()=>({
                command: ["./fitsviewer/processor"],
                options: {
                    stdio: [
                        'pipe',
                        'pipe',
                        'inherit'
                    ],
                    stdin: new MemoryStreams.ReadableStream(JSON.stringify(jsonRequest)),
                    stdout: writableStream
                }
            })).setCancelable(true),
            new Promises.Cancelable<void, void>((next)=> {
                if (writableStreamDone) {
                    next.done(undefined);
                } else {
                    writableStreamCb = ()=>next.done(undefined);
                }
            }),
            new Promises.Immediate(()=> {
                const result = writableStream.toString();
                return JSON.parse(result);
            })
        );
    }

    $api_compute(jsonRequest: any) {
        return this.compute(jsonRequest.details);
    }
}
