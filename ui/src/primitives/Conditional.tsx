import * as React from 'react';
import * as Store from '../Store';

type InputProps<TYPE> = {
    accessor: Store.Accessor<TYPE>;
    condition?: (t:TYPE)=>boolean
}

type MappedProps<TYPE> = {
    value: TYPE;
}

type Props<TYPE> = InputProps<TYPE> & MappedProps<TYPE>;

class Conditional<TYPE> extends React.PureComponent<Props<TYPE>> {
    render() {
        const value = this.props.value;
        let display : boolean;
        if (this.props.condition) {
            display = this.props.condition(value);
        } else {
            display = !!value;
        }
        return display ? this.props.children : null;
    }

    static mapStateToProps<TYPE>(store: Store.Content, ownProps: InputProps<TYPE>) {
        return ({
            value: ownProps.accessor.fromStore(store)
        });
    }
}

export default Store.Connect(Conditional);
