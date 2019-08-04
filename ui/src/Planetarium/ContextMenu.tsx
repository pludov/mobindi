import React, { Component, PureComponent, CSSProperties, RefObject} from 'react';
import { VirtualSkyRightClick } from './Sky';


export type Props = {
    event: VirtualSkyRightClick;
    goto?: (e:VirtualSkyRightClick)=>void;
    sync?: (e:VirtualSkyRightClick)=>void;
}

export default class ContextMenu extends PureComponent<Props> {
    private readonly itemRef: RefObject<HTMLDivElement> = React.createRef();

    constructor(props:Props) {
        super(props);
    }

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
            if (this.props.event.canvasx + sze.cx > sze.px) {
                // Update the css: move left
                item.style.left = (parseFloat(item.style.left!) - (this.props.event.canvasx + sze.cx - sze.px)) + "px";
            }
            if (this.props.event.canvasy + sze.cy > sze.py) {
                // Update the css: move up
                item.style.top = (parseFloat(item.style.top!) - (this.props.event.canvasy + sze.cy - sze.py)) + "px";
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

    private goto = ()=>this.props.goto!(this.props.event);
    private sync = ()=>this.props.sync!(this.props.event);

    render() {
        const css:CSSProperties = {
            left: this.props.event.canvasx,
            top: this.props.event.canvasy,
            position: 'absolute'
        }
        return(
            <div className="ImageContextMenu" style={css} ref={this.itemRef}>
                {this.props.goto
                    ? <div className="Item" onClick={this.goto}>Goto here</div>
                    : null
                }
                {this.props.sync
                    ? <div className="Item" onClick={this.sync}>Sync scope</div>
                    : null
                }
            </div>);
    }
}
