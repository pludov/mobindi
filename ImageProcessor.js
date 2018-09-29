const memory_streams = require('memory-streams');
const Obj = require('./Obj.js');
const ConfigStore = require('./ConfigStore');
const Promises = require('./Promises');
const SystemPromises = require('./SystemPromises');


// Ugggglyyy fix for end of stream 
memory_streams.ReadableStream.prototype._read = function(n) {
    this.push(this._data);
    this._data = null;
  };

class ImageProcessor
{
    constructor(jsonProxy, context) {
        this.jsonProxy = jsonProxy;
    }

    $api_compute(jsonRequest) {
        var self = this;
        let writableStream;
        let writableStreamDone;
        let writableStreamCb;
        function captureDone() 
        {
            writableStreamDone = true;
            if (writableStreamCb) {
                writableStreamCb();
            }
        }
        return new Promises.Chain(
            new Promises.Immediate(() => {
                writableStream = new memory_streams.WritableStream();
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
                    stdin: new memory_streams.ReadableStream(JSON.stringify(jsonRequest.details)),
                    stdout: writableStream
                }
            })),
            new Promises.Cancelable((next)=> {
                if (writableStreamDone) {
                    next.done();
                } else {
                    writableStreamCb = ()=>next.done();
                }
            }),
            new Promises.Immediate((e)=> {
                return JSON.parse(writableStream.toString());
            })
        );
    }
}

module.exports = {ImageProcessor};
