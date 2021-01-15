import * as React from 'react';
import ReactResizeDetector from 'react-resize-detector';

import * as Store from '../Store';

import { atPath } from '../shared/JsonPath';
import './Table.css';
import TableEntry, { UnmappedTableEntry } from './TableEntry';

export type HeaderItem = {
    id:string;
}

export type FieldDefinition = {
    render?:(item: any)=>React.ReactNode
    title: string;
    defaultWidth: string;
}

type InputProps = {
    statePath: string;
    currentPath: string;
    currentAutoSelectSerialPath: string;
    fields: {[id: string]: FieldDefinition},
    defaultHeader: Array<HeaderItem>,
    // store => [items]
    getItemList: (s:Store.Content)=>Array<string>,
    // store, uid => item
    getItem: (s:Store.Content, uid:string)=>any,
    onItemClick: (uid:string, e:React.MouseEvent<HTMLTableRowElement>)=>any,
}

type MappedProps = {
    itemList: Array<string>;
    header: Array<HeaderItem>;
    current: string;
    currentAutoSelectSerial: number;
}

type Props = InputProps & MappedProps;

function firstDefined<T>(a: T, b: T): T
{
    if (a !== undefined) return a;
    return b;
}

/**
 * state for table is :
 *  (none)
 */
class Table extends React.PureComponent<Props> {
    private selected = React.createRef<UnmappedTableEntry>();

    private header = React.createRef<HTMLTableElement>();
    private lastScrollSerial?:number = undefined;

    scrollIfRequired() {
        if (this.lastScrollSerial === undefined || this.lastScrollSerial < this.props.currentAutoSelectSerial) {
            const selected = this.selected.current;
            if (selected) {
                selected.scrollIn();
                this.lastScrollSerial = (this.props.currentAutoSelectSerial||0);
            }
        }
    }

    componentDidMount() {
        this.scrollIfRequired();
    }

    componentDidUpdate() {
        this.scrollIfRequired();
    }

    onParentResize=(width:number, height:number)=> {
        this.header.current!.style.width = width + "px";
    }

    render() {
        const content = [];
        for(const o of this.props.itemList)
        {
            content.push(<TableEntry
                key={o}
                fields={this.props.fields}
                header={this.props.header}
                getItem={this.props.getItem}
                // statePath={this.props.statePath + '.items[' + JSON.stringify(o) + ']'}
                uid={o}
                onItemClick={this.props.onItemClick}
                selected={o===this.props.current}
                ref={o===this.props.current ? this.selected : null}
            />);
        }

        const cols = [];
        const header = [];
        for(const o of this.props.header) {
            const field = this.props.fields[o.id];
            header.push(<th key={o.id}>
                {field.title}
            </th>);
            cols.push(<col key={o.id} style={{width: field.defaultWidth}}/>);
        }
        return <div className="DataTable">
            <table className="DataTableHeader" ref={this.header}>
                <colgroup>
                    {cols}
                </colgroup>
                <thead>
                    <tr>{header}</tr>
                </thead>
            </table>
            <div className="DataTableScrollable">
                <div>
                    <ReactResizeDetector handleWidth onResize={this.onParentResize} />

                    <table className="DataTableData">
                        <colgroup>
                            {cols}
                        </colgroup>
                        <tbody>
                            {content}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>;
    }

    static mapStateToProps = function(store: Store.Content, ownProps: InputProps): MappedProps
    {
        // FIXME: dispatch the cleanup of state of entries
        return {
            itemList: ownProps.getItemList(store),
            header: firstDefined(atPath(store, ownProps.statePath + ".header"), ownProps.defaultHeader),
            current: atPath(store, ownProps.currentPath),
            currentAutoSelectSerial : ownProps.currentAutoSelectSerialPath ? atPath(store, ownProps.currentAutoSelectSerialPath) : 0,
        };
    }
}

export default Store.Connect(Table);
