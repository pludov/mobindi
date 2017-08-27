import React, { Component, PureComponent} from 'react';
import PropTypes from 'prop-types';
import { notifier, BackendStatus } from './Store';
import { connect } from 'react-redux';

import { atPath } from './shared/JsonPath';
import './Table.css';

function firstDefined(a, b)
{
    if (a !== undefined) return a;
    return b;
}

class TableEntry extends PureComponent {

    constructor(props) {
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
                details = field.render(this.props.item);
            } else {
                details = "" + this.props.item[o.id];
            }
            content.push(<td key={o.id}>
                {details}
            </td>)
        }
        return <tr onClick={this.onClick} className={this.props.selected?"selected" : ""}>{content}</tr>
    }

    onClick(e) {
        console.log('WTF clicked', e);
        this.props.onItemClick(this.props.uid, e);
    }

    static mapStateToProps = function(store, ownProps)
    {
        var result= {
            item: ownProps.getItem(store, ownProps.uid)
        }
        console.log('map state to prop wtf:', ownProps.uid, JSON.stringify(result));
        return result;
    }
}

TableEntry = connect(TableEntry.mapStateToProps)(TableEntry);
TableEntry.propTypes = {
    uid: PropTypes.string.isRequired,
    statePath: PropTypes.string.isRequired,
    fields: PropTypes.object.isRequired,
    header: PropTypes.array.isRequired,
    // store, uid => item
    getItem: PropTypes.func.isRequired,
    onItemClick: PropTypes.func,
    selected: PropTypes.bool
}

/**
 * state for table is :
 *  (none)
 */
class Table extends PureComponent {

    render() {
        var content = [];
        for(var o of this.props.itemList)
        {
            content.push(<TableEntry key={o}
                fields={this.props.fields}
                header={this.props.header}
                getItem={this.props.getItem}
                statePath={this.props.statePath + '.items[' + JSON.stringify(o) + ']'}
                uid={o}
                onItemClick={this.props.onItemClick}
                selected={o===this.props.current}
            />);
        }

        var cols = [];
        var header = [];
        for(var o of this.props.header) {
            var field = this.props.fields[o.id];
            header.push(<th key={o.id}>
                {field.title}
            </th>);
            cols.push(<col key={o.id} style={{width: field.defaultWidth}}/>);
        }
        return <div className="DataTable">
            <table className="DataTableHeader">
                <colgroup>
                    {cols}
                </colgroup>
                <thead>
                    <tr>{header}</tr>
                </thead>
            </table>
            <table className="DataTableData">
                <colgroup>
                    {cols}
                </colgroup>
                <tbody>
                    {content}
                </tbody>
            </table>
        </div>;
    }

    static mapStateToProps = function(store, ownProps)
    {
        // FIXME: dispatch the cleanup of state of entries
        return {
            itemList: ownProps.getItemList(store),
            header: firstDefined(atPath(store, ownProps.statePath + ".header"), ownProps.defaultHeader),
            current: atPath(store, ownProps.currentPath)
        };
    }
}

Table = connect(Table.mapStateToProps)(Table);
Table.propTypes = {
    statePath: PropTypes.string.isRequired,
    currentPath: PropTypes.string.isRequired,
    fields: PropTypes.object.isRequired,
    defaultHeader: PropTypes.array.isRequired,
    // store => [items]
    getItemList: PropTypes.func.isRequired,
    // store, uid => item
    getItem: PropTypes.func.isRequired,
    onItemClick: PropTypes.func
}


export default Table;