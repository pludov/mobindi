import * as React from 'react';
import * as Store from '../Store';
import * as Table from "./Table";
import ScrollableText from '../ScrollableText';

export type InputProps = {
    header: Array<Table.HeaderItem>;
    fields: {
        [id: string]: Table.FieldDefinition
    };
    selected: boolean;
    uid: string;

    onItemClick: (uid:string, e:React.MouseEvent<HTMLTableRowElement>)=>void;
    getItem: (store: Store.Content, uid: string)=>any;
};

export type MappedProps = {
    item: any;
};

export type Props = MappedProps & InputProps;

class TableEntry extends React.PureComponent<Props> {

    constructor(props:Props) {
        super(props);
        this.onClick = this.onClick.bind(this);
    }

    render() {
        var content = [];
        for(var o of this.props.header)
        {
            var field = this.props.fields[o.id];
            var details;
            if ('render' in field) {
                details = field.render!(this.props.item);
            } else {
                details = this.props.item === undefined ? "N/A" : "" + this.props.item[o.id];
            }
            content.push(<td key={o.id}><ScrollableText>{details}</ScrollableText>
            </td>)
        }
        return <tr onClick={this.onClick} className={this.props.selected?"selected" : ""}>{content}</tr>
    }

    onClick=(e:React.MouseEvent<HTMLTableRowElement>)=>{
        console.log('WTF clicked', e);
        this.props.onItemClick(this.props.uid, e);
    }

    static mapStateToProps = function(store:Store.Content, ownProps:InputProps): MappedProps
    {
        return {
            item: ownProps.getItem(store, ownProps.uid)
        }
    }
}

export default Store.Connect(TableEntry);
