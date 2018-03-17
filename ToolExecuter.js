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
        this.tools = {};
        this.context = context;
        jsonProxy.getTarget().toolExecuter = {
            tools: {}
        };
        this.config = jsonProxy.getTarget().toolExecuter.tools;

        jsonProxy.addSynchronizer(['toolExecuter'/*, 'triggers'*/],
            this.syncTools.bind(this),
            true);

        new ConfigStore(jsonProxy, 'toolExecuter', ['toolExecuter', 'tools'], {

        }, {
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

    syncTools()
    {
        /*console.log('Syncing triggers');
        for(var ikey of Object.keys(this.config))
        {
            var wantedParams = this.config[ikey];
            if (!Obj.hasKey(this.instanciatedTriggers, ikey)) {
                this.instanciatedTriggers[ikey] = this.createTrigger(ikey, Obj.deepCopy(wantedParams));
            } else {
                var existing = this.instanciatedTriggers[ikey];
                if (!Obj.deepEqual(existing.params, wantedParams)) {
                    this.instanciatedTriggers[ikey] = this.createTrigger(ikey, Obj.deepCopy(wantedParams));
                }
            }
        }

        for(var ikey of Object.keys(this.instanciatedTriggers))
        {
            if (!Obj.hasKey(this.config, ikey)) {
                delete this.instanciatedTriggers[ikey];
            }
        }*/
    }

    $api_startTool(message, progress)
    {
        var self = this;
        return new Promises.Builder(() =>
        {
            var which = message.uid;
            if (!which) {
                throw new Error("Invalid id");
            }
            if (Obj.hasKey(self.config[which])) {
                throw new Error("Unknown id");
            }
            var cmd = self.config[which].cmd;
            console.log('Starting ' + JSON.stringify(cmd));
            return new SystemPromises.Exec(cmd);
        });
    }
};


module.exports = ToolExecuter;