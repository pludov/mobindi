import * as React from 'react';
import Log from './shared/Log';
import * as Help from './Help';

const logger = Log.logger(__filename);

type Control = {
    id: string;
    title: string;
    run: ()=>Promise<any>;
}

type NumberStored = {
    setValue?: undefined;
    active?: undefined;
    activeNumber: number|null;
    setNumber:(d:number)=>Promise<any>;
}

type StringStored = {
    active: string|null;
    setValue:(d:string)=>Promise<any>;
}

type ValueOverride = {
    id: string;
    title: string;
}

export type Props<TYPE> = (NumberStored | StringStored) & {
    nullAlwaysPossible?: boolean;
    placeholder: string;
    availablesGenerator: (props: Props<TYPE>)=>Array<TYPE>;
    getId: (o: TYPE, props: Props<TYPE>)=>string;
    getTitle: (o: TYPE, props: Props<TYPE>)=>string;
    controls?: Array<Control>;
    focusRef?: React.RefObject<HTMLSelectElement>;
    helpKey?: Help.Key;
    valueOverride?: ValueOverride;
    className?: string;
};
type State<TYPE> = {
    forcedValue: string|null;
    runningPromise: Promise<any>|undefined;
};

/**
 * A selector that start a promise on update
 * 
 * Supported values: numbers, strings, booleans, null
 */
export default class PromiseSelector<TYPE> extends React.PureComponent<Props<TYPE>, State<TYPE>> {
    static defaultProps = {
        getTitle: (e:any)=>'' + e,
        getId: (e:any)=>e,
        placeholder: 'Choose...',
        availablesGenerator: (props:any)=>props.availables
    }

    constructor(props:Props<TYPE>) {
        super(props);
        this.state = {
            forcedValue: null,
            runningPromise: undefined,

        };
    }

    getActiveString() {
        const numberStored = (this.props as NumberStored);
        if (numberStored.activeNumber !== undefined) {
            if (numberStored.activeNumber === null) {
                return null;
            }
            return "" + numberStored.activeNumber;
        }
        return (this.props as StringStored).active;
    }

    setValueString() {
        const numberStored = (this.props as NumberStored);
        if (numberStored.setNumber !== undefined) {
            const setNumber = numberStored.setNumber;
            return async (d:string)=> {
                return await setNumber(parseFloat(d));
            }
        }
        return (this.props as StringStored).setValue;
    }

    render() {

        var availables = this.props.availablesGenerator(this.props);
        if (!availables) availables = [];
        var options = [];
        let disabled: boolean = true;
        let currentValue : string;
        if (this.state.forcedValue === null && this.props.valueOverride !== undefined) {
            // Add a specific value
            const tmpVal = this.props.valueOverride;
            currentValue = "tmp:" + tmpVal.id;
            options.push(<option
                            value={currentValue}
                            key={currentValue}>
                        {tmpVal.title}</option>);

            disabled = false;
        } else {
            let active = this.getActiveString();
            if (active == undefined) active = null;
            if (this.state.forcedValue !== null) {
                active = this.state.forcedValue;
                logger.debug('Using forced value', {active});
            }
            currentValue = JSON.stringify(active);

            if (active == null || this.props.nullAlwaysPossible) {
                options.push(<option disabled={!this.props.nullAlwaysPossible} hidden={!this.props.nullAlwaysPossible} value='null' key='null'>{this.props.placeholder}</option>)
                if (this.props.nullAlwaysPossible) {
                    disabled = false;
                }
            }

            if (active != null) {
                var present = false;
                for(const o of availables) {
                    if (this.props.getId(o, this.props) === active) {
                        present = true;
                    }
                }
                if (!present) {
                    options.push(<option value={currentValue} key={currentValue}>{this.props.getTitle((""+active) as any as TYPE, this.props)}</option>);
                    disabled = false;
                }
            }
        }
        for(const v of availables) {
            const id = JSON.stringify(this.props.getId(v, this.props));
            options.push(<option value={id} key={id}>{this.props.getTitle(v, this.props)}</option>);
            disabled = false;
        }

        if (this.props.controls) {
            for(const v of this.props.controls) {
                var id = "ctrl:" + JSON.stringify(v.id);
                options.push(<option value={id} key={id}>{v.title}</option>);
                disabled = false;
            }
        }

        return <select ref={this.props.focusRef}
                    disabled={(this.state.runningPromise !== undefined) || disabled}
                    value={currentValue}
                    onChange={(e)=>this.clicked(e.target.value)}
                    className={this.props.className}
                    {...this.props.helpKey?.dom()}
                    >{options}
            </select>;
    }

    // Force the selection of an item (by id)
    public select = (value: string) => {
        this.clicked(JSON.stringify(value));
    }

    clicked(value:string)
    {
        if (value !== null && value !== undefined && value.startsWith("ctrl:")) {
            var id = JSON.parse(value.substring(5));
            if (this.props.controls) {
                for(const v of this.props.controls) {
                    if (v.id == id) {
                        logger.debug('select entry', {id});
                        this.selectEntry(null, v.run);
                    }
                }
            }
        } else {
            this.selectEntry(JSON.parse(value), this.setValueString());
        }
    }

    asyncUpdatePromise(from:Promise<any>|undefined, to:Promise<any>|undefined, forcedValue: string|null)
    {
        this.setState((prevState)=>{
            if (prevState.runningPromise === from) {
                return {
                    ...prevState,
                    runningPromise: to,
                    forcedValue: forcedValue
                };
            }
            return prevState;
        });
    }

    // FIXME: ici on veut des task
    // Est-ce qu'on peut garder un promise + un CT ?
    async selectEntry(d:string|null, generator:(d:string|null)=>Promise<any>) {
        if (generator === undefined) return;

        if (this.state.runningPromise) {
            // FIXME: this.state.runningPromise.cancel();
            // this.setState(this.updatePromise(this.state.runningPromise, undefined, undefined));

            this.asyncUpdatePromise(this.state.runningPromise, undefined, null);
        }


        let newpromise;
        try {
            newpromise = generator(d);
            this.asyncUpdatePromise(undefined, newpromise, d);
            
            await newpromise;

        } finally {
            this.asyncUpdatePromise(newpromise, undefined, null);
        }
    }
}

