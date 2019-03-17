import React, { Component, PureComponent, CSSProperties, RefObject} from 'react';
import { ContextMenuEntry, LevelId } from './FitsViewer';

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

    adjust() {
        // ensure that the menu does not go outside the container
        const item:HTMLDivElement|null = this.itemRef.current;
        if (item !== null) {

            const sze  = {
                x: item.style.left,
                y: item.style.top,
                cx: item.clientWidth,
                cy: item.clientHeight,
                px: (item.parentNode! as HTMLDivElement).clientWidth,
                py: (item.parentNode! as HTMLDivElement).clientHeight,
            }
            if (this.props.x + sze.cx > sze.px) {
                // Update the css: move left
                item.style.left = (parseFloat(item.style.left!) - (this.props.x + sze.cx - sze.px)) + "px";
            }
            if (this.props.y + sze.cy > sze.py) {
                // Update the css: move up
                item.style.top = (parseFloat(item.style.top!) - (this.props.y + sze.cy - sze.py)) + "px";
            }
            console.log('rendered sze: ', sze);
        }
    }

    componentDidMount() {
        this.adjust();
    }

    componentDidUpdate() {
        this.adjust();
    }

    render() {
        const css:CSSProperties = {
            left: this.props.x,
            top: this.props.y,
            position: 'absolute'
        }
        return(
            <div className="ImageContextMenu" style={css} ref={this.itemRef}>
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
            </div>);
    }
}
