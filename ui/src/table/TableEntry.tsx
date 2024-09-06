import * as React from 'react';
// import { createSelector } from 'reselect';
import ArrayReselect from '../utils/ArrayReselect';
import * as Store from '../Store';
import * as Table from "./Table";
import ScrollableText from '../ScrollableText';

export type Props<DatabaseObject> = {
    height: string;
    cellStyles: Array<React.CSSProperties>;
    header: Array<Table.HeaderItem>;
    fields: {
        [id: string]: Table.FieldDefinition
    };
    selected: boolean;
    uid: string;

    item: any;
    onItemClick: (uid:string, e:React.MouseEvent<HTMLTableRowElement>)=>void;
};

class TableEntry<DatabaseObject> extends React.PureComponent<Props<DatabaseObject>> {
    private tr = React.createRef<HTMLTableRowElement>();

    constructor(props:Props<DatabaseObject>) {
        super(props);
    }

    render() {
        var content = [];

        const item = this.props.item;
        let i = 0;
        for(var o of this.props.header)
        {
            var field = this.props.fields[o.id];
            var details;
            if ('render' in field) {
                details = field.render!(item);
            } else {
                details = item === undefined ? "N/A" : "" + item[o.id];
            }
            content.push(<div key={o.id} className={"Cell" + (field.cellClass ? (" " + field.cellClass) : "")} style={this.props.cellStyles[i]}>
                <ScrollableText>
                    {details}
                </ScrollableText>
            </div>)
            i++;
        }

        return <div onClick={this.onClick} className={`Row ${this.props.selected?"selected" : ""}`} style={{height: this.props.height, overflow: "hidden" }} ref={this.tr}>
                {content}
            </div>
    }

    onClick=(e:React.MouseEvent<HTMLTableRowElement>)=>{
        this.props.onItemClick(this.props.uid, e);
    }

    scrollIn=()=>{
        const tr = this.tr.current;
        if (tr) {
            tr.scrollIntoView();
        }
    }
}


export default TableEntry;
