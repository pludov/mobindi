import * as React from 'react';
import * as Help from '../Help';
import * as Store from '../Store';
import "./QuickBton.css";

type InputProps = {
    accessor: Store.Accessor<string|undefined>;
    helpKey?: Help.Key;
    className?: string;
}

type MappedProps = {
    value: string|undefined;
}

type Props = InputProps & MappedProps;

class AccessorSelector extends React.PureComponent<Props> {
    render() {
        return <span className='cameraSetting' {...this.props.helpKey?.dom()}>
            <select value={this.props.value || ""}
                    onChange={this.update}
                    className={`AccessorSelector ${this.props.className || ""}`}>
                {this.props.children}
            </select>
        </span>;
    }

    update=(e:React.ChangeEvent<HTMLSelectElement>)=>{
        this.props.accessor.send(e.target.value);
    }

    static mapStateToProps(store:Store.Content, ownProps:InputProps) {
        return ({
            value: ownProps.accessor.fromStore(store)
        });
    }
}

export default Store.Connect(AccessorSelector);
