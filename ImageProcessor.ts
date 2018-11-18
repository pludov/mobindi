import MemoryStreams from 'memory-streams';
import * as Promises from './Promises';
import * as SystemPromises from './SystemPromises';

import {ProcessorRequest} from './shared/ProcessorTypes';


// Ugggglyyy fix for end of stream
MemoryStreams.ReadableStream.prototype._read = function(n) {
    const self : any = this;
    this.push(self._data);
    self._data = null;
  };

export default class ImageProcessor
{
    jsonProxy:any;

    constructor(jsonProxy:any, context:any) {
        this.jsonProxy = jsonProxy;
    }

    compute(jsonRequest: ProcessorRequest):Promises.Cancelable<void, any> {
        var self = this;
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
            })),
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
