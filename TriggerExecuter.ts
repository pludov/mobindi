import CancellationToken from 'cancellationtoken';
import Log from './Log';
import * as Obj from './Obj';
import ConfigStore from './ConfigStore';
import { BackofficeStatus, TriggerConfig, TriggerExecuterStatus, ToolConfig } from './shared/BackOfficeStatus';
import JsonProxy from './JsonProxy';
import { AppContext } from './ModuleBase';

const logger = Log.logger(__filename);

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
    private readonly key: string;
    readonly params: TriggerConfig;
    private readonly context: AppContext;
    private last: string[];

    constructor(key:string, params: TriggerConfig, context: AppContext)
    {
        this.key = key;
        this.params = params;
        this.context = context;
        this.last = [];
    }

    private getProperties=(newState: BackofficeStatus)=>{
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

    private getCurrentValue=(newState: BackofficeStatus):string[]=> {
        var prop = this.getProperties(newState);
        if (prop === undefined) return [];
        var result = [];
        for(var i = 0 ; i < prop.length; ++i) {
            result[i] = prop[i].$_;
        }
        return result;
    }

    private getTargetProperty=(i:number)=> {
        if (Array.isArray(this.params.property)) {
            return this.params.property[i];
        } else if (i == 0) {
            return this.params.property;
        } else {
            throw new Error("Wrong trigger properties");
        }
    }

    private getTargetValue=(i:number)=> {
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

    private action=(newState: BackofficeStatus, oldValues: string[], newValues:string[])=> {
        if (oldValues.length == 0) {
            var toSet: {[id:string]:string} = {};
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
                        await this.context.indiManager.setParam(
                            CancellationToken.CONTINUE,
                            this.params.device,
                            this.params.vector,
                            toSet
                        );
                    } catch(e) {
                        logger.error('Trigger failed' , {key: this.key}, e);
                    }
                })();
            }
        }
    }

    check(newState: BackofficeStatus)
    {
        var newValue = this.getCurrentValue(newState);
        if (!Obj.deepEqual(this.last, newValue)) {
            logger.debug('Activating trigger' , {key: this.key});
            
            var previousValue = this.last;
            this.last = newValue;
            this.action(newState, previousValue, newValue);
        }
    }
};

export default class TriggerExecuter
{
    private jsonProxy: JsonProxy<BackofficeStatus>;
    private instanciatedTriggers: {[id:string]:IndiNewProperty};
    private context: AppContext;
    config: { [id: string]: TriggerConfig; };

    constructor(jsonProxy:JsonProxy<BackofficeStatus>, context:AppContext) {
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

        new ConfigStore<TriggerExecuterStatus['triggers']>(jsonProxy, 'triggerExecuter', ['triggerExecuter', 'triggers'], {
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

        this.jsonProxy.addListener(this.listener);
        this.listener();
    }

    private createTrigger=(key:string, params: TriggerConfig)=>{
        logger.debug('Instanciating trigger' , {key, params});
        var result = new IndiNewProperty(key, params, this.context);

        try {
            result.check(this.jsonProxy.getTarget());
        } catch(e) {
            logger.debug('Error in trigger' , {key, params}, e);
        }
        return result;
    }

    private syncTriggers=()=>
    {
        logger.debug('Syncing triggers');
        for(const ikey of Object.keys(this.config))
        {
            const wantedParams = this.config[ikey];
            if (!Obj.hasKey(this.instanciatedTriggers, ikey)) {
                this.instanciatedTriggers[ikey] = this.createTrigger(ikey, Obj.deepCopy(wantedParams));
            } else {
                var existing = this.instanciatedTriggers[ikey];
                if (!Obj.deepEqual(existing.params, wantedParams)) {
                    this.instanciatedTriggers[ikey] = this.createTrigger(ikey, Obj.deepCopy(wantedParams));
                }
            }
        }

        for(const ikey of Object.keys(this.instanciatedTriggers))
        {
            if (!Obj.hasKey(this.config, ikey)) {
                delete this.instanciatedTriggers[ikey];
            }
        }
    }

    private listener=()=>
    {
        var state = this.jsonProxy.getTarget();
        for(var key of Object.keys(this.instanciatedTriggers)) {
            try {
                this.instanciatedTriggers[key].check(state);
            } catch(e) {
                logger.error('Error in trigger', {key}, e);
            }
        }
    }
};

