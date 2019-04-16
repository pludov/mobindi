import CancellationToken from 'cancellationtoken';
import * as Obj from './Obj';
import JsonProxy from './JsonProxy';
import { BackofficeStatus, ToolConfig, ToolExecuterStatus } from './shared/BackOfficeStatus';
import * as BackOfficeAPI from './shared/BackOfficeAPI';
import { AppContext } from './ModuleBase';
import * as SystemPromise from './SystemPromise';
import * as RequestHandler from "./RequestHandler";
import ConfigStore from './ConfigStore';

// Allow to start a script from the UI. 
// The script can produce output in the form of messages
// For now, messages goes into indi logs

type InstanciatedTool = {
    id: string;
    params: ToolConfig;
}

export default class ToolExecuter implements RequestHandler.APIAppProvider<BackOfficeAPI.ToolExecuterAPI>
{
    private readonly jsonProxy: JsonProxy<BackofficeStatus>;
    private readonly context: AppContext;
    private readonly instanciatedTools: {[id:string]:InstanciatedTool};
    private readonly status: ToolExecuterStatus;

    constructor(jsonProxy:JsonProxy<BackofficeStatus>, context:AppContext) {
        this.jsonProxy = jsonProxy;
        this.instanciatedTools = {};
        this.context = context;
        jsonProxy.getTarget().toolExecuter = {
            tools: {}
        };
        this.status = jsonProxy.getTarget().toolExecuter;

        jsonProxy.addSynchronizer(['toolExecuter', 'tools'],
            this.syncTools,
            true);

        new ConfigStore<ToolExecuterStatus["tools"]>(jsonProxy, 'toolExecuter', ['toolExecuter', 'tools'], {

        }, {
            "welcome": {
                "desc": "Announce the startup of mobindi - not accessible through UI",
                "cmd": ["touch", "/tmp/mobindi.started" ],
                "hidden": true,
                "trigger":"atstart"
            },
            "led_off": {
                "desc":'Turn lights off',
                "cmd": ["sudo", "-n", "/opt/local/lights.sh", "off"]
            },
            "reboot": {
                "desc": "Reboot",
                "confirm": "Do you really want to reboot ?",
                "cmd": ["sudo", "-n", "/opt/local/reboot.sh"]
            },
            "shutdown": {
                "desc": "Shutdown",
                "confirm": "Do you really want to shutdown ?",
                "cmd": ["sudo", "-n", "/opt/local/shutdown.sh"]
            }
        });
    }


    private initTool=(id:string, params:ToolConfig):InstanciatedTool=>
    {
        var result = ({
            id: id,
            params: params
        })
        if (params.trigger === "atstart") {
            this.runTool(result);
        }
        return result;
    }

    // Given a tool object, returns a promise for its execution
    private runTool=async (tool: InstanciatedTool)=>{
        try {
            console.log('Will start ' + tool.id + ' as: ' + JSON.stringify(tool.params.cmd));
            const ret = await SystemPromise.Exec(CancellationToken.CONTINUE, {
                command: tool.params.cmd
            });
            console.log('Task ' + tool.id + ' terminated with code : ', ret);
        } catch(e) {
            console.log('Task ' + tool.id + ' on error : ', e)
        }
    }

    private syncTools=()=>
    {
        // At least a trigger def was updated.

        for(const ikey of Object.keys(this.status.tools))
        {
            const wantedParams = this.status.tools[ikey];
            if (!Obj.hasKey(this.instanciatedTools, ikey)) {
                this.instanciatedTools[ikey] = this.initTool(ikey, Obj.deepCopy(wantedParams));
            } else {
                var existing = this.instanciatedTools[ikey];
                if (!Obj.deepEqual(existing.params, wantedParams)) {
                    this.instanciatedTools[ikey] = this.initTool(ikey, Obj.deepCopy(wantedParams));
                }
            }
        }

        for(const ikey of Object.keys(this.instanciatedTools))
        {
            if (!Obj.hasKey(this.status.tools, ikey)) {
                delete this.instanciatedTools[ikey];
            }
        }
    }

    public startTool = async (ct: CancellationToken, message: {uid: string}) => {
        const which = message.uid;
        if (!which) {
            throw new Error("Invalid id");
        }
        if (!Obj.hasKey(this.instanciatedTools, which)) {
            throw new Error("Unknown id");
        }

        const toStart = this.instanciatedTools[which];
        this.runTool(toStart);
    }

    getAPI():RequestHandler.APIAppImplementor<BackOfficeAPI.ToolExecuterAPI> {
        return {
            startTool : this.startTool,
        };
    }
};
