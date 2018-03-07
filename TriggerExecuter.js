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
        this.parameterValue = undefined;
        this.last = {value: undefined};
    }

    getProperty(newState) {
        if (newState.indiManager === undefined) return undefined;
        var device = newState.indiManager.deviceTree[this.params.device];
        if (device === undefined) return undefined;
        var vector = device[this.params.vector];
        if (vector === undefined) return undefined;
        var property = vector.childs[this.params.property];
        if (property === undefined) return undefined;
        return property;
    }

    getCurrentValue(newState)
    {
        var prop = this.getProperty(newState);
        if (prop === undefined) return {};
        return {value: prop.$_};
    }

    action(newState, oldValue, newValue) {
        if (oldValue.value === undefined && newValue.value != this.params.value) {
            this.context.indiManager.setParam(
                this.params.device,
                this.params.vector,
                { [this.params.property]: this.params.value}
            ).start();
        }
    }

    check(newState)
    {
        var newValue = this.getCurrentValue(newState);
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