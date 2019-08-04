import React, { PureComponent, CSSProperties, RefObject, MouseEvent} from 'react';

export type Props = {
    x: number;
    y: number;
}

export default class ContextMenuContainer extends PureComponent<Props> {
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
            if (this.props.x + sze.cx > sze.px) {
                // Update the css: move left
                item.style.left = (parseFloat(item.style.left!) - (this.props.x + sze.cx - sze.px)) + "px";
            }
            if (this.props.y + sze.cy > sze.py) {
                // Update the css: move up
                item.style.top = (parseFloat(item.style.top!) - (this.props.y + sze.cy - sze.py)) + "px";
            }
        }
    }

    componentDidMount() {
        this.adjust();
    }

    componentDidUpdate() {
        this.adjust();
    }

    contextMenu = (e: MouseEvent<HTMLDivElement>)=>{
        e.preventDefault();
    }

    render() {
        const css:CSSProperties = {
            left: this.props.x,
            top: this.props.y,
            position: 'absolute'
        }
        return(
            <div className="ImageContextMenu" style={css} ref={this.itemRef} onContextMenu={this.contextMenu}>
                {this.props.children}
            </div>);
    }
}
