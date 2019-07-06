import child_process, { SpawnOptions } from 'child_process';
import Stream from 'stream';
import CancellationToken from 'cancellationtoken';
import MemoryStreams from 'memory-streams';
import { StringDecoder } from 'string_decoder';

// Ugggglyyy fix for end of stream
MemoryStreams.ReadableStream.prototype._read = function(n) {
    const self : any = this;
    this.push(self._data);
    self._data = null;
  };


export type ExecParams = {
    command: string[];
    options?: SpawnOptions;

    stdin?: Stream.Readable;
    stdout?: Stream.Writable;
    stderr?: Stream.Writable;
}

export function Exec(ct: CancellationToken, p : ExecParams):Promise<number> {
    ct.throwIfCancelled();
    return new Promise<number>((resolve, reject)=> {

        const opts = {
            stdio: [process.stdin, process.stdout, process.stderr],
            ...p.options
        };
        const child = child_process.spawn(p.command[0], p.command.slice(1), opts);
        if (p.stdin) {
            p.stdin.pipe(child.stdin);
        }
        if (p.stdout) {
            child.stdout.pipe(p.stdout);
        }
        if (p.stderr) {
            child.stderr.pipe(p.stderr);
        }

        let killed = false;
        let finishCb = ct.onCancelled(()=>{
            killed = true;
            child.kill();
        });

        child.on('error', (err)=> {
            if (!killed) {
                finishCb();
                reject(err);
            }
        });

        child.on('exit', (ret, signal) => {
            finishCb();
            if (ret !== null) {
                resolve(ret);
            } else {
                if (ct.isCancelled && signal === 'SIGTERM') {
                    reject(new CancellationToken.CancellationError(ct.reason));
                } else {
                    reject(new Error('Received ' + signal + ' for ' + JSON.stringify(p.command)));
                }
            }
        });
    });
}

export async function Pipe(ct: CancellationToken, p: ExecParams, input: Stream.Readable, lineCb?: (e:string)=>(void)): Promise<string> {
    let result: string = "";

    let writableStream: Stream.Writable;
    let writableStreamDone: boolean = false;
    let writableStreamCb:undefined|(()=>(void));

    function captureDone()
    {
        writableStreamDone = true;
        if (writableStreamCb) {
            writableStreamCb();
        }
    }

    if (!lineCb) {
        let writableMemoryStream: MemoryStreams.WritableStream;

        writableStream = writableMemoryStream = new MemoryStreams.WritableStream();
        writableMemoryStream.on('finish', ()=> {
            result = writableMemoryStream.toString()
            captureDone();
        });
    } else {
        const stringDecoder = new StringDecoder("utf8");
        let currentLine: string = "";

        const proceedCurrentLine=(finish:boolean)=>{
            let p;
            while((p = currentLine.indexOf('\n')) != -1) {
                const line = currentLine.substring(0, p);
                currentLine = currentLine.substring(p + 1);
                try {
                    lineCb(line);
                } catch(e) {
                    writableStream.emit('error', e);
                    return;
                }
            }
            if (finish && currentLine) {
                try {
                    lineCb(currentLine);
                } catch(e) {
                    writableStream.emit('error', e);
                    return;
                }
            }
        }

        writableStream = new Stream.Writable();
        writableStream._write = (chunk, encoding, next) => {
            console.log('read from STDOUT', chunk, encoding);
            if (encoding !== 'buffer') {
                writableStream.emit('error', new Error('unsupported encoding'));
            } else {
                const str = stringDecoder.write(chunk);
                currentLine += str;
                proceedCurrentLine(false);
            }
            next();
        }

        writableStream.on('finish', ()=> {
            proceedCurrentLine(true);
            captureDone();
        });
    }

    writableStreamCb = undefined;
    writableStreamDone = false;

    const ret = await Exec(ct, {
            stdin: input,
            ...p,
            options: {
                stdio: [
                    'pipe',
                    'pipe',
                    'inherit'
                ],
                ...p.options
            },
            stdout: writableStream
    });

    if (!writableStreamDone) {
        await new Promise((resolve, reject)=> {
            writableStreamCb = resolve;
        });
        writableStreamCb = undefined;
    };

    if (ret !== 0) {
        throw new Error("Pipe failed " + JSON.stringify(p.command) + " with exit code: " + ret);
    }

    return result;
}

// Returns true if process exists, false otherwise
export async function PidOf(ct: CancellationToken, exe: string):Promise<boolean> {
    const exitCode = await Exec(ct, {
        command: ["pidof", exe, exe + ".bin"]
    });
    if (exitCode === 0) {
        return true;
    } else if (exitCode === 1) {
        return false;
    }
    throw new Error("Bad exitcode for pidof: " + exitCode);
}

