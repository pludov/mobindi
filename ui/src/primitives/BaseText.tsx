import * as React from 'react';
import Log from '../shared/Log';
import * as Help from '../Help';
import * as Store from '../Store';
import TextEdit from '../TextEdit';

const logger = Log.logger(__filename);

export type InputProps<TYPE> = {
    accessor: Store.Accessor<TYPE>;
    toString: (t:TYPE)=>string;
    fromString: (s:string)=>TYPE;
    helpKey?: Help.Key;
}

export type MappedProps<TYPE> = {
    value: TYPE;
}

export type Props<TYPE> = InputProps<TYPE> & MappedProps<TYPE>;

export default class BaseText<TYPE> extends React.PureComponent<Props<TYPE>> {
    render() {
        let value = this.props.value;
        let strValue = this.props.toString(value);
        return <span className='cameraSetting' {...this.props.helpKey?.dom()}>
            {this.props.children}
                <TextEdit
                    value={strValue}
                    onChange={(e)=>this.update(e)}/>
        </span>;
    }

    xform(e:string) {
        return e;
    }

    update=(e:string)=>{
        let t : TYPE;
        try {
            t = this.props.fromString(e);
        } catch(err) {
            logger.warn("error parsing value", {value: e}, err);
            return;
        }
        return this.props.accessor.send(t);
    }

    static mapStateToProps<TYPE>(store:Store.Content, ownProps: InputProps<TYPE>) {
        return ({
            value: ownProps.accessor.fromStore(store)
        });
    }
}
