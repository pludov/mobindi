import child_process from 'child_process';
import CancellationToken from 'cancellationtoken';
import Log from './Log';
import { ProcessConfiguration } from './shared/BackOfficeStatus';
import * as SystemPromise from './SystemPromise';
import Sleep from './Sleep';

const logger = Log.logger(__filename);

// Ensure that a process is running.
// Restart as required.
// Configuration expect:
//   autorun
//   path
//   env
export default class ProcessStarter {
    private readonly exe: string;
    private readonly configuration: ProcessConfiguration;

    constructor(exe:string, configuration: ProcessConfiguration) {
        this.exe = exe;
        this.configuration = configuration;
        if (this.configuration.autorun) {
            this.lifeCycle(CancellationToken.CONTINUE);
        }
    }

    private startExe() {
        logger.info('Starting', {exe: this.exe});
        var env = process.env;
        env = Object.assign({}, env);
        env = Object.assign(env, this.configuration.env);

        var exe = this.exe;
        if (this.configuration.path !== null) {
            exe = this.configuration.path + "/" + exe;
        }
        var child = child_process.spawn(exe, [], {
            env: env,
            detached: true,
            stdio: "ignore",
        });
        child.on('error', (err)=> {
            logger.warn('Error', {exe: this.exe}, err);
        });
    }

    private lifeCycle=async (ct:CancellationToken)=>{
        while(true) {
            const exists = await SystemPromise.PidOf(ct, this.exe);

            if (!exists) {
                this.startExe();
            }

            await Sleep(ct, 2000);
        }
    }
}
