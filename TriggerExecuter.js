import CancellationToken from 'cancellationtoken';
const Obj = require('./Obj.js');
const ConfigStore = require('./ConfigStore');

// Connect to a JSONProxy and react to state change

// Example trigger:
//  {
//
//      desc:   'Autoconnect CCD Simulator'
//      type:   'indi-new-property',
//      device: 'CCD Simulator',
//      property:'Connection',
//      value:  'Disconnect'
//      trigger: switchToValue('Connect')
// }
//
//

class IndiNewProperty
{
    constructor(key, params, context)
    {
        this.key = key;
        this.params = params;
        this.context = context;
        this.last = [];
    }

    getProperties(newState) {
        if (newState.indiManager === undefined) return undefined;
        var device = newState.indiManager.deviceTree[this.params.device];
        if (device === undefined) return undefined;
        var vector = device[this.params.vector];
        if (vector === undefined) return undefined;
        if (Array.isArray(this.params.property)) {
            var result = [];
            for(var i = 0; i < this.params.property.length; ++i)
            {
                var property = vector.childs[this.params.property[i]];
                if (property === undefined) return undefined;
                result[i] = property;
            }
            return result;
        } else {
            var property = vector.childs[this.params.property];
            if (property === undefined) return undefined;
            return [property];
        }
    }

    getCurrentValue(newState)
    {
        var prop = this.getProperties(newState);
        if (prop === undefined) return [];
        var result = [];
        for(var i = 0 ; i < prop.length; ++i) {
            result[i] = prop[i].$_;
        }
        return result;
    }

    getTargetProperty(i)
    {
        if (Array.isArray(this.params.property)) {
            return this.params.property[i];
        } else if (i == 0) {
            return this.params.property;
        } else {
            throw new Error("Wrong trigger properties");
        }
    }

    getTargetValue(i)
    {
        if (Array.isArray(this.params.property)) {
            if (!Array.isArray(this.params.value)) {
                throw new Error("Array/simple mismatch for trigger properties");
            }
            return this.params.value[i];
        } else if (i == 0) {
            if (Array.isArray(this.params.value)) {
                throw new Error("Array/simple mismatch for trigger properties");
            }
            return this.params.value;
        } else {
            throw new Error("Wrong trigger properties");
        }
    }

    action(newState, oldValues, newValues) {
        var self = this;
        if (oldValues.length == 0) {
            var toSet = {};
            var changeRequired = false;
            for(var i = 0 ; i < newValues.length; ++i) {
                var targetValue = this.getTargetValue(i);
                if (targetValue !== newValues[i]) {
                    changeRequired = true;
                    toSet[this.getTargetProperty(i)] = targetValue;
                }
            }
            if (changeRequired) {
                (async ()=> {
                    try {
                        console.log('Using cancellation token: ', CancellationToken.CONTINUE);
                        await this.context.indiManager.setParam(
                            CancellationToken.CONTINUE,
                            this.params.device,
                            this.params.vector,
                            toSet
                        );
                    } catch(e) {
                        console.log('Trigger ' + self.key + ' failed', e);
                    }
                })();
            }
        }
    }

    check(newState)
    {
        var newValue = this.getCurrentValue(newState);
        console.log('trigger:' + this.key + "=> " + JSON.stringify(newValue));
        if (!Obj.deepEqual(this.last, newValue)) {
            console.log('Activating trigger:' + this.key);
            
            var previousValue = this.last;
            this.last = newValue;
            this.action(newState, previousValue, newValue);
        }
    }
};

class TriggerExecuter
{

    constructor(jsonProxy, context) {
        this.jsonProxy = jsonProxy;
        this.instanciatedTriggers = {};
        this.context = context;
        jsonProxy.getTarget().triggerExecuter = {
            triggers: {}
        };
        this.config = jsonProxy.getTarget().triggerExecuter.triggers;

        jsonProxy.addSynchronizer(['triggerExecuter'/*, 'triggers'*/],
            this.syncTriggers.bind(this),
            true);

        new ConfigStore(jsonProxy, 'triggerExecuter', ['triggerExecuter', 'triggers'], {
            
        }, {
            autoconnect_CCDSimulator: {
                desc:'testautoconnect',
                device: 'CCD Simulator',
                vector:'CONNECTION',
                property: 'CONNECT',
                value: 'On'
            },
            "gps_autoset_lat": {
                "desc": "Push local coordinates to Mount",
                "device":   "Mount",
                "vector":   "GEOGRAPHIC_COORD",
                "property": ["LONG", "LAT"],
                "value":    ["1.4", "48.0833"]
            }
        });
        

/*        this.triggers.push(new IndiNewProperty({
            desc:'testautoconnect',
            device: 'CCD Simulator',
            vector:'CONNECTION',
            property: 'CONNECT',
            value: 'On'
        }, context));
*/

        this.jsonProxy.addListener(this.listener.bind(this));
        this.listener();
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

    syncTriggers()
    {
        console.log('Syncing triggers');
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
        }
    }

    listener()
    {
        var state = this.jsonProxy.getTarget();
        for(var key of Object.keys(this.instanciatedTriggers)) {
            try {
                this.instanciatedTriggers[key].check(state);
            } catch(e) {
                console.error('Error in trigger ' +key, e);
            }
        }
    }
};


module.exports = TriggerExecuter;