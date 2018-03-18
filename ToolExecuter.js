const Obj = require('./Obj.js');
const ConfigStore = require('./ConfigStore');
const Promises = require('./Promises');
const SystemPromises = require('./SystemPromises');

// Allow to start a script from the UI. 
// The script can produce output in the form of messages
// For now, messages goes into indi logs


class ToolExecuter
{

    constructor(jsonProxy, context) {
        this.jsonProxy = jsonProxy;
        this.instanciatedTools = {};
        this.context = context;
        jsonProxy.getTarget().toolExecuter = {
            tools: {}
        };
        this.config = jsonProxy.getTarget().toolExecuter.tools;

        jsonProxy.addSynchronizer(['toolExecuter', 'tools'],
            this.syncTools.bind(this),
            true);

        new ConfigStore(jsonProxy, 'toolExecuter', ['toolExecuter', 'tools'], {

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

    createTrigger(key, params) {
        console.log('Instanciating trigger: ' + key);
        var result = new IndiNewProperty(key, params, this.context);

        try {
            result.check(this.jsonProxy.getTarget());
        } catch(e) {
            console.error('Error in trigger ' +key, e);
        }
        return result;
    }

    initTool(id, params)
    {
        var result = ({
            id: id,
            params: params
        })
        if (params.trigger === "atstart") {
            this.startTool(result)
                .onError((e)=>console.log('Autostart task error : ' + result.params.id, e))
                .onCancel(()=>console.log('Autostart task canceled : ' + result.params.id))
                .start();
        }
        return result;
    }

    // Given a tool object, returns a promise for its execution
    startTool(tool) {
        console.log('Will start ' + JSON.stringify(tool.params.cmd));
        return new SystemPromises.Exec(tool.params.cmd);
    }

    syncTools()
    {
        // At least a trigger def was updated.

        for(var ikey of Object.keys(this.config))
        {
            var wantedParams = this.config[ikey];
            if (!Obj.hasKey(this.instanciatedTools, ikey)) {
                this.instanciatedTools[ikey] = this.initTool(ikey, Obj.deepCopy(wantedParams));
            } else {
                var existing = this.instanciatedTools[ikey];
                if (!Obj.deepEqual(existing.params, wantedParams)) {
                    this.instanciatedTools[ikey] = this.initTool(ikey, Obj.deepCopy(wantedParams));
                }
            }
        }

        for(var ikey of Object.keys(this.instanciatedTools))
        {
            if (!Obj.hasKey(this.config, ikey)) {
                delete this.instanciatedTools[ikey];
            }
        }
    }

    $api_startTool(message, progress)
    {
        var self = this;
        return new Promises.Builder(() =>
        {
            var which = message.uid;
            console.log('Request to start tool', JSON.stringify(which));
            if (!which) {
                throw new Error("Invalid id");
            }
            if (!Obj.hasKey(self.instanciatedTools, which)) {
                throw new Error("Unknown id");
            }

            var toStart = self.instanciatedTools[which];
            return self.startTool(toStart);
        });
    }
};


module.exports = ToolExecuter;