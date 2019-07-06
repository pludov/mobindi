import 'mocha';

import assert from 'assert';
import MemoryStreams from 'memory-streams';
import CancellationToken from 'cancellationtoken';
import {Exec, Pipe} from './SystemPromise';

describe("report error if exe not found", ()=> {
    it('Report exit code', async ()=> {
        const falseRet = await Exec(CancellationToken.CONTINUE, {command: ["/bin/false"]});
        assert.strictEqual(falseRet, 1, "/bin/false returns 1");

        const trueRet = await Exec(CancellationToken.CONTINUE, {command: ["/bin/true"]});
        assert.strictEqual(trueRet, 0, "/bin/true returns 0");
    });

    it('Detect spawn error', async ()=> {
        let failed;
        try {
            await Exec(CancellationToken.CONTINUE, {command: ["/that_directory_wont_exist_anywhere/that_dummy_filename"]});
            failed = false;
        } catch(e) {
            failed = true;
        }
        assert.strictEqual(failed, true, "Detect spawn error");
    });

    it('Can interrupt', async ()=> {
        const {token, cancel} = CancellationToken.create();
        const promise = Exec(token, {command: ["/bin/sleep", "1"]});

        let canceled = undefined;
        try {
            cancel();
            const exitCode = await promise;
            canceled = false;
        } catch(e) {
            if (e instanceof CancellationToken.CancellationError) {
                canceled = true;
            } else {
                throw e;
            }
        }
        assert.strictEqual(canceled, true, "sleep 1 was not canceled");
    });

    it('Can pipe data', async ()=> {
        const content = await Pipe(CancellationToken.CONTINUE, {
                command: [ "md5sum" ]
            },
            new MemoryStreams.ReadableStream("coucou"));
        assert.strictEqual(content.substr(0, 32), "721a9b52bfceacc503c056e3b9b93cfa", "Pipe through md5");
    });
    it('Can pipe data line by line', async function () {
        this.timeout(5000);
        const startTime = new Date().getTime();
        let lines: Array<{line:string, t: number}> = [];

        const content = await Pipe(CancellationToken.CONTINUE, {
                command: [ "sh", "-c", "echo line0; sleep 0.2 ; echo line1; sleep 0.2; echo line2" ]
            },
            new MemoryStreams.ReadableStream(""),
            (line)=>lines.push({line, t: Math.round((new Date().getTime() - startTime) / 200)})
        );
        assert.strictEqual(content.substr(0, 32), "", "Pipe with line callback outputs nothing");
        assert.deepStrictEqual(lines, [
                        {line: "line0", t: 0},
                        {line: "line1", t: 1},
                        {line: "line2", t: 2}
        ], "Timed arrival of lines");
    });

});

