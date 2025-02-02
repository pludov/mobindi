import child_process, { SpawnOptions } from 'child_process';
import Stream from 'stream';
import CancellationToken from 'cancellationtoken';
import MemoryStreams from 'memory-streams';
import { StringDecoder } from 'string_decoder';
import Log from './Log';
import fs from 'fs';

const logger = Log.logger(__filename);

// Ugggglyyy fix for end of stream
MemoryStreams.ReadableStream.prototype._read = function(n:any) {
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
            p.stdin.pipe(child.stdin!);
        }
        if (p.stdout) {
            child.stdout!.pipe(p.stdout);
        }
        if (p.stderr) {
            child.stderr!.pipe(p.stderr);
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

export async function Pipe(ct: CancellationToken, p: ExecParams, input: Stream.Readable | undefined, lineCb?: (e:string)=>(void)): Promise<string> {
    const result = await UncheckedPipe(ct, p, input, lineCb);

    if (result.exitCode !== 0) {
        throw new Error("Pipe failed " + JSON.stringify(p.command) + " with exit code: " + result.exitCode);
    }

    return result.stdout;
}

export async function UncheckedPipe(ct: CancellationToken, p: ExecParams, input?: Stream.Readable, lineCb?: (e:string)=>(void)): Promise<{exitCode: number, stdout: string}> {
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
        let finishCall = 0;
        const buffers:Array<Buffer> = [];
        writableStream = writableMemoryStream = new MemoryStreams.WritableStream();
        writableStream._write = (chunk, encoding, next) => {
            if (encoding as any !== 'buffer') {
                logger.error('Received not a buffer', {encoding});
                writableStream.emit('error', new Error('unsupported encoding'));
            } else {
                buffers.push(chunk);
            }
            next();
            return true;
        }

        writableMemoryStream.on('finish', ()=> {
            if (finishCall === 0) {
                finishCall++;
                result = Buffer.concat(buffers).toString();
                buffers.splice(0, buffers.length);
                captureDone();
            }
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
            if (encoding as any !== 'buffer') {
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
            writableStreamCb = ()=>{resolve(undefined)};
        });
        writableStreamCb = undefined;
    };

    return {
        exitCode: ret,
        stdout: result
    }
}

// Returns the command line of a process.
// Non ascii characters are messed up due to utf8/latin1 conversion
export async function getCommand(ct: CancellationToken, pid: number):Promise<Array<string>> {
    try {
        const content = await fs.promises.readFile(`/proc/${pid}/cmdline`);
        return content.toString('latin1').split('\0');
    } catch(e: any) {
        if (e.code === 'ENOENT') {
            return [];
        }
        throw e;
    }
}

// Returns the list of PIDs of a process (by name).
// Childs get excluded (they appear during fork/exec, like driver startup)
export async function PidOf(ct: CancellationToken, exe: string):Promise<Array<number>> {
    const r = await UncheckedPipe(ct, {
        command: ["pidof", exe, exe + ".bin"]
    });
    if (r.exitCode === 0) {
        const pidlist = r.stdout.trim().split(/ /).map((e)=>parseInt(e)).sort((a, b) => a - b);
        if (pidlist.length > 1) {
            // Use ps to filter those which don't have father in the list
            const psList = await UncheckedPipe(ct, {
                command: ["ps", "-o", "pid,ppid", "-p", pidlist.join(',')]
            });

            const filteredList = [];
            for(let line of psList.stdout.split(/\n/)) {
                line = line.trim();
                const [pidStr, ppidStr] = line.split(/ +/);
                const pid = parseInt(pidStr);
                const ppid = parseInt(ppidStr);
                if (pidlist.indexOf(pid) !== -1) {
                    if (ppid === pid || pidlist.indexOf(ppid) === -1) {
                        filteredList.push(pid);
                    }
                }
            }
            filteredList.sort();
            return filteredList;
        }
        return pidlist;
    } else if (r.exitCode === 1) {
        return [];
    }
    throw new Error("Bad exitcode for pidof: " + r.exitCode);
}

