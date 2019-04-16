import * as React from 'react';
import * as Store from '../Store';
import * as BaseText from './BaseText';

type Props = {
    accessor: Store.Accessor<string|undefined|null>;
    toString: (t:string|undefined|null)=>string;
    fromString: (s:string)=>string|undefined|null;
}

const MappedText = Store.Connect<BaseText.default<string|undefined|null>, Props, {}, {}>(BaseText.default);

class Text extends React.PureComponent<Props> {
    static defaultProps = {
        toString: (t:string|undefined|null)=>(t||""),
        fromString: (t:string)=>t,
    }

    render() {
        return <MappedText
                    accessor={this.props.accessor}
                    toString={this.props.toString}
                    fromString={this.props.fromString}
                    children={this.props.children}
                />
    }
}

export default Text;