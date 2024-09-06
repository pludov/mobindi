import * as React from 'react';
import ReactResizeDetector from 'react-resize-detector';

import * as Store from '../Store';

import { atPath } from '../shared/JsonPath';
import * as Obj from '../shared/Obj';
import './Table.css';
import TableEntry from './TableEntry';
import ObjectReselect from '../utils/ObjectReselect';

export type HeaderItem = {
    id:string;
}

export type FieldDefinition = {
    render?:(item: any)=>React.ReactNode
    title: string;
    minimumWidth: string;
    grow?: number;
    cellClass?: string;
}

type InputProps<DatabaseObject> = {
    statePath: string;
    currentPath: string;
    currentAutoSelectSerialPath: string;
    fields: {[id: string]: FieldDefinition},
    defaultHeader: Array<HeaderItem>,
    itemHeight: string;

    getDatabases: (store: Store.Content)=>DatabaseObject;
    // store => [items]
    getItemList: (database: DatabaseObject)=>Array<string>,
    // store, uid => item
    getItem: (databases:DatabaseObject, uid:string)=>any,
    onItemClick: (uid:string, e:React.MouseEvent<HTMLTableRowElement>)=>any,
}

type MappedProps<DatabaseObject> = {
    header: Array<HeaderItem>;
    databases: DatabaseObject;
    current: string;
    currentAutoSelectSerial: number;
}

type Props<DatabaseObject> = InputProps<DatabaseObject> & MappedProps<DatabaseObject>;

function firstDefined<T>(a: T, b: T): T
{
    if (a !== undefined) return a;
    return b;
}

type State = {
    minId:number;
    maxId:number;
}
/**
 * state for table is :
 *  (none)
 */
class Table<DatabaseObject> extends React.PureComponent<Props<DatabaseObject>, State> {
    private selected = React.createRef<HTMLDivElement>();

    private scrollAreaRef = React.createRef<HTMLDivElement>();
    private tbodyRef = React.createRef<HTMLTableSectionElement>();
    private header = React.createRef<HTMLTableElement>();
    private lastScrollSerial?:number = undefined;

    constructor(props:Props<DatabaseObject>) {
        super(props);
        this.state = {
            minId: 0,
            maxId: 0
        }
    }

    getElemHeight() {
        const match = /^([\d.]+)(.*)$/.exec(this.props.itemHeight);
        if (!match) {
            throw new Error("invalid height. Try 1.25em");
        }
        return {
            elemHeight: parseFloat(match[1]),
            heightUnit: match[2]
        };
    }

    updateBounds=()=> {
        const tbody = this.tbodyRef.current;
        if (!tbody) return false;

        const scrollAreaElt = this.scrollAreaRef.current;
        if (!scrollAreaElt) return false;

        const items = this.props.getItemList(this.props.databases);
        const eltCount = items.length;

        const sizeRef = tbody.getBoundingClientRect();
        const heightRef = sizeRef.height / eltCount;

        const scrollAreaRect = scrollAreaElt.getBoundingClientRect();
        const scrollAreaHeight = scrollAreaRect.height;

        const minId = Math.floor(scrollAreaElt.scrollTop / heightRef);
        const maxId = Math.ceil((scrollAreaElt.scrollTop + scrollAreaHeight + 1) / heightRef) + 1;

        if (this.state.minId === minId && this.state.maxId === maxId) {
            return false;
        }

        this.setState({minId, maxId});

        return true;
    }

    scrolled=()=>{
        setTimeout(()=>{
            this.updateBounds()
        });
    }

    scrollIfRequired() {
        setTimeout(()=>{
            this.updateBounds();
            if (this.lastScrollSerial === undefined || this.lastScrollSerial < this.props.currentAutoSelectSerial) {
                const selected = this.selected.current;
                if (selected) {
                    selected.scrollIntoView();
                    this.lastScrollSerial = (this.props.currentAutoSelectSerial||0);
                }
            }
        },1);
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

    lastCellStyle:Array<React.CSSProperties>=[];

    cellStyle=()=> {
        const { elemHeight, heightUnit } = this.getElemHeight();

        const cellStyle = [];
        const cellMinWidths = []
        let growSum = 0;

        for(const o of this.props.header) {
            const field = this.props.fields[o.id];
            if (field.grow) growSum += field.grow;
            cellMinWidths.push(field.minimumWidth);
        }
        for(const o of this.props.header) {
            const field = this.props.fields[o.id];
            cellStyle.push({
                width: !field.grow
                        ? field.minimumWidth
                        : `calc( ${field.minimumWidth} + ${field.grow / growSum} * ( 100% - ${cellMinWidths.join(' - ')} ) )`,
                display: "inline-block",
                height: (elemHeight + heightUnit)
            });
        }
        if (!Obj.deepEqual(cellStyle, this.lastCellStyle)) {
            this.lastCellStyle = cellStyle;
            console.log(cellStyle);
        }

        return this.lastCellStyle;
    }

    render() {
        const content = [];
        const { elemHeight, heightUnit } = this.getElemHeight();

        let id = 0;
        const items = this.props.getItemList(this.props.databases);
        let totalHeight = elemHeight * items.length;

        const cellStyle = this.cellStyle();

        const header = [];
        let i = 0;
        for(const o of this.props.header) {
            const field = this.props.fields[o.id];
            const style = cellStyle[i];
            header.push(<div key={o.id} style={style} className={`CellHeader`}>
                {field.title}
            </div>);
            i++;
        }

        let selector: React.ReactElement<any, any>|null = null;
        let spacer: React.ReactElement<any, any>|null = null;
        if (this.state.minId > 0) {
            spacer = <div style={{height: (elemHeight * this.state.minId) + heightUnit}}>
            </div>;
        }
        for(id = this.state.minId; id < this.state.maxId && id < items.length; ++id) {
            const o = items[id];
            const item = this.props.getItem(this.props.databases, o);
            content.push(<TableEntry
                    key={o}
                    height={elemHeight + heightUnit}
                    cellStyles={cellStyle}
                    fields={this.props.fields}
                    header={this.props.header}
                    item={item}
                    uid={o}
                    onItemClick={this.props.onItemClick}
                    selected={o===this.props.current}
                />);
        }

        const selectedId = items.indexOf(this.props.current);
        if (selectedId !== -1) {
            selector=<div style={{height: (elemHeight + heightUnit),  position: "absolute", width: "100%", top: (selectedId * elemHeight) + heightUnit}} ref={this.selected}>
            </div>
        }

        return <div className="DataTable">
            <div className="DataTableHeader" ref={this.header}>
                <div>
                    {header}
                </div>
            </div>
            <div className="DataTableScrollable" ref={this.scrollAreaRef} onScroll={this.scrolled}>
                <div>
                    <ReactResizeDetector handleWidth onResize={this.onParentResize} />

                    <div className="DataTableData" style={{height: totalHeight + heightUnit, position: "relative"}} ref={this.tbodyRef}>
                        {selector}
                        {spacer}
                        {content}
                    </div>
                </div>
            </div>
        </div>;
    }

    static mapStateToProps<DatabaseObject>():(store: Store.Content, ownProps: InputProps<DatabaseObject> )=> MappedProps<DatabaseObject>
    {
        const databaseSelector = ObjectReselect.createObjectSelector((store: Store.Content, ownProps:InputProps<DatabaseObject>)=>ownProps.getDatabases(store));
        // FIXME: dispatch the cleanup of state of entries
        return (store: Store.Content, ownProps: InputProps<DatabaseObject>)=>({
            databases: databaseSelector(store, ownProps),
            header: firstDefined(atPath(store, ownProps.statePath + ".header"), ownProps.defaultHeader),
            current: atPath(store, ownProps.currentPath),
            currentAutoSelectSerial : ownProps.currentAutoSelectSerialPath ? atPath(store, ownProps.currentAutoSelectSerialPath) : 0,
        });
    }
}

export default Store.Connect(Table);
