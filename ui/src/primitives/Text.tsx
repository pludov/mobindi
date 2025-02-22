import * as React from 'react';
import * as Store from '../Store';
import * as BaseText from './BaseText';
import * as Help from '../Help';

type Props = {
    accessor: Store.Accessor<string|undefined|null>;
    helpKey?: Help.Key;
}

const MappedText = Store.Connect<BaseText.default<string|undefined|null>, BaseText.InputProps<string|undefined|null>, {}, {}>(BaseText.default);

class Text extends React.PureComponent<Props> {
    render() {
        return <MappedText
                    // FIXME: This any cast sound like compiler confusion
                    toString={this.stringToString as any}
                    accessor={this.props.accessor}
                    fromString={this.stringFromString}
                    children={this.props.children}
                    helpKey={this.props.helpKey}
                />
    }

    stringToString=(s:string|undefined|null)=>{
        return s||"";
    }

    stringFromString=(s:string)=>{
        return s;
    }
}

export default Text;