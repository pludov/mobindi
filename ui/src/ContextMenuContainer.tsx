import React, { PureComponent, CSSProperties, RefObject, MouseEvent} from 'react';

export type Props = {
    x: number;
    y: number;
    close: ()=>void;
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

    private readonly onParentEvent = (e:Event)=>{
        const item:HTMLDivElement|null = this.itemRef.current;
        if (item === null) return;
        const parent = item.parentElement;
        if (parent === null) return;

        let target = e.target;
        while(target !== null) {
            if (target === item) {
                return;
            }
            if (target == parent) {
                this.props.close();
                return;
            }
            if ('parentNode' in target) {
                target = (target as HTMLElement).parentNode;
            } else {
                target = null;
            }
        }
    }

    register() {
        const item:HTMLDivElement|null = this.itemRef.current;
        if (item === null) return;
        const parent = item.parentElement;
        if (parent === null) return;
        parent.addEventListener('mousedown', this.onParentEvent, {capture:true});
        parent.addEventListener('touchstart', this.onParentEvent, {capture:true});
        parent.addEventListener('wheel', this.onParentEvent, {capture:true});
    }

    unregister() {
        const item:HTMLDivElement|null = this.itemRef.current;
        if (item === null) return;
        const parent = item.parentElement;
        if (parent === null) return;
        parent.removeEventListener('mousedown', this.onParentEvent, {capture:true});
        parent.removeEventListener('touchstart', this.onParentEvent, {capture:true});
        parent.removeEventListener('wheel', this.onParentEvent, {capture:true});
    }

    componentDidMount() {
        this.adjust();
        this.register();
    }

    componentDidUpdate() {
        this.adjust();
    }

    componentWillUnmount() {
        this.unregister();
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
