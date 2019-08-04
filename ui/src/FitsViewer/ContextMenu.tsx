import React, { Component, PureComponent, CSSProperties, RefObject} from 'react';
import { ContextMenuEntry, LevelId } from './FitsViewer';
import ContextMenuContainer from '../ContextMenuContainer';

export type Props = {
    displaySetting:(s:LevelId|"fwhm"|null)=>void;
    contextMenu?: ContextMenuEntry[];
    x: number;
    y: number;
    xlateCoords: (x:number, y:number)=>{imageX: number, imageY:number}|null;
}

export default class ContextMenu extends PureComponent<Props> {
    private readonly itemRef: RefObject<HTMLDivElement> = React.createRef();

    constructor(props:Props) {
        super(props);
    }

    showLow= ()=>this.props.displaySetting('low');
    showMedium= () => this.props.displaySetting('medium');
    showHigh= () => this.props.displaySetting('high');
    showFwhm= () => this.props.displaySetting('fwhm');

    render() {
        return(
            <ContextMenuContainer x={this.props.x} y={this.props.y}>
                {
                    !this.props.contextMenu ? null :
                        this.props.contextMenu.map(e => <div
                                className="Item"
                                onClick={()=> {
                                    this.props.displaySetting(null);
                                    let event = {
                                        x: this.props.x,
                                        y: this.props.y,
                                    };
                                    event = {...event, ...this.props.xlateCoords(event.x, event.y)};
                                    e.cb(event);
                                }}
                                key={e.key}>
                            {e.title}
                        </div>)
                }
                <div className="Item" onClick={this.showLow}>Low level</div>
                <div className="Item" onClick={this.showMedium}>Median</div>
                <div className="Item" onClick={this.showHigh}>High level</div>
                <div className="Item" onClick={this.showFwhm}>FWHM</div>
            </ContextMenuContainer>
        );
    }
}
