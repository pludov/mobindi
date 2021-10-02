import * as React from 'react';
import * as Help from '../Help';
import * as Store from '../Store';
import * as BaseText from './BaseText';

type Props = {
    accessor: Store.Accessor<number|null>;
    min?: number;
    max?: number;
    helpKey?: Help.Key;
    digits?: number;
}

const MappedNumber = Store.Connect<BaseText.default<number|null>, BaseText.InputProps<number|null>, {}, {}>(BaseText.default);

class Float extends React.PureComponent<Props> {
    render() {
        return <MappedNumber
                    accessor={this.props.accessor}
                    toString={this.numberToString}
                    fromString={this.numberFromString}
                    children={this.props.children}
                    helpKey={this.props.helpKey}
                    />
    }

    numberToString=(n?:number|null)=>{
        if (n === null || n === undefined) {
            return "";
        }
        if (this.props.digits !== undefined) {
            return n.toFixed(this.props.digits);
        }
        return "" + n;
    }

    numberFromString=(s:string)=>{
        if (s.trim() === "") {
            return null;
        }
        const n = parseFloat(s);
        if (isNaN(n)) {
            throw new Error("float required");
        }
        if (this.props.min !== undefined && n < this.props.min) {
            throw new Error("Must be >= " + this.props.min);
        }
        if (this.props.max !== undefined && n > this.props.max) {
            throw new Error("Must be <= " + this.props.max);
        }

        // keep precision of current value
        if (this.props.digits !== undefined) {
            const current = this.props.accessor.fromStore(Store.getStore().getState());
            if (current !== null && current !== undefined && this.numberToString(current) === s) {
                return current;
            }
        }

        return n;
    }
}

export default Float;