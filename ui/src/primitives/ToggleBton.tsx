import * as React from 'react';
import * as Help from '../Help';
import * as Store from '../Store';
import "./ToggleBton.css";
type InputProps = {
    accessor: Store.Accessor<boolean>;
    helpKey?: Help.Key;
    className?: string;
}

type MappedProps = {
    value: boolean;
}

type Props = InputProps & MappedProps;

class ToggleBton extends React.PureComponent<Props> {
    render() {
        return <span className='cameraSetting' {...this.props.helpKey?.dom()}>
            <div
                className={`ToggleBton ${this.props.className || ""} ${!!this.props.value ? "checked" : "unchecked"}`}
                onClick={this.update}/>
        </span>;
    }

    update=()=>{
        this.props.accessor.send(!this.props.value);
    }

    static mapStateToProps(store:Store.Content, ownProps:InputProps) {
        return ({
            value: ownProps.accessor.fromStore(store)
        });
    }
}

export default Store.Connect(ToggleBton);