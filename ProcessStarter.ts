import child_process from 'child_process';
import CancellationToken from 'cancellationtoken';
import Log from './Log';
import { ProcessConfiguration } from './shared/BackOfficeStatus';
import * as SystemPromise from './SystemPromise';
import Sleep from './Sleep';
import fs from 'fs';

const logger = Log.logger(__filename);

export async function handleSystemdStartup(args: string[], env: {[key:string]:string|undefined}, systemdServiceName?:string) {
    if (systemdServiceName || process.env.MOBINDI_USE_SYSTEMD_RUN) {
        const exe_path = args[0];
        const exe_name = exe_path.split('/').pop();

        const unitname = systemdServiceName || exe_name;
        // Run using systemd
        const systemctl = ['/usr/bin/systemd-run', '--user', '--collect', `--unit=${unitname}`];
        for(const [key, value] of Object.entries(env)) {
            if (value === undefined) {
                continue;
            }
            systemctl.push('--setenv', `${key}=${value}`);
        }

        // We need to find the path of the exe
        if (exe_path.indexOf('/') === -1) {
            let found = false;
            for(const dir of (env.PATH || process.env.PATH || "").split(':')) {
                const path = `${dir}/${args[0]}`;
                try {
                    let stat = await fs.promises.stat(path);
                    if (stat.isFile() && (stat.mode & fs.constants.S_IXUSR)) {
                        args[0] = path;
                        found = true;
                        break;
                    }
                } catch(e) {
                    logger.debug('Path not found', {path, e});
                    continue;
                }
            }
            if (!found) {
                logger.error('Path not found', {exe_path});
                args[0] = exe_path;
            }
        } else {
            args[0] = exe_path;
        }

        args = [...systemctl, ...args];
        env = {};
    }
    env = {...process.env, ...env};

    return {args, env};
}

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

    private async startExe() {
        logger.info('Starting', {exe: this.exe});
        let env = process.env;
        env = Object.assign({}, env);
        env = Object.assign(env, this.configuration.env);

        let args = [this.configuration.path !== null ? this.configuration.path + "/" + this.exe : this.exe];

        let params = await handleSystemdStartup(args, env, undefined);
        const child = child_process.spawn(params.args[0], params.args.slice(1), {
            env: params.env,
            detached: true,
            stdio: "ignore",
        });
        child.on('error', (err)=> {
            logger.warn('Error', {exe: this.exe}, err);
        });
    }

    private lifeCycle=async (ct:CancellationToken)=>{
        while(true) {
            const pid = await SystemPromise.PidOf(ct, this.exe);

            if (!pid.length) {
                await this.startExe();
                await Sleep(ct, 5000);
            } else {
                await Sleep(ct, 2000);
            }
        }
    }
}
