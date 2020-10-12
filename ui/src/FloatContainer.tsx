import React, { Component, PureComponent, ReactNode} from 'react';
import FloatWindow from './FloatWindow';
import ReactResizeDetector from 'react-resize-detector';

type Props = {

}

type State = {
    pos: {
        [id:string]: Position
    }
}

type Position = {
    x: number;
    y: number;
}

type Size = {
    w: number;
    h: number;
}

type Pref = {
    x: number|undefined;
    y: number|undefined;
}

export type FloatContainerContext = {
    deltaMove:(dx:number, dy:number)=>void;
}

export default class FloatContainer extends React.PureComponent<Props, State> {
    private childRefs: {[id:string]: React.RefObject<HTMLDivElement>} = {};
    private childResizeHandlers : {[id:string]: (w:number, h:number)=>void} = {};
    private childSizes: {[id: string]: Size|undefined} = {};
    private childContext: {[id: string]: FloatContainerContext} = {};

    private childPrefs: {[id: string]: Pref } = {};

    public static Context = React.createContext<FloatContainerContext>({deltaMove: ()=>{}});

    constructor(props:Props) {
        super(props);
        this.state = {
            pos: {}
        };
    }

    // Adjust div pos according to size constraints
    relayout() {
        console.log('relayout', this.childSizes);
        // For every child that has a size, make sure it fits within parent area
        for(const id of Object.keys(this.childRefs)) {
            const div:HTMLDivElement|null = this.childRefs[id]!.current;
            console.log('relayout child', div);
            if (div === null) {
                continue;
            }

            div.style.left = '15px';
            div.style.top = '55px';
        }
    }

    componentDidMount() {
        // relayout();
    }

    componentWillReceiveProps() {
        // FIXME: invalidate sizes
    }

    onParentResize=(width:number, height:number)=> {
        console.log('onResize');
        this.relayout();
    }

    onChildResize=(id:string, w: number, h: number)=>{
        this.childSizes[id] = {w, h};
    }

    moveChild=(id:string, dx: number, dy: number)=> {
        const item = this.childRefs[id]?.current;
        console.log('Moving child ', item, id, dx, dy);
        
        if (item) {
            const x = item.offsetLeft + dx;
            const y = item.offsetTop + dy;
            item.style.left = x + "px";
            item.style.top = y + "px";
        }
    }

    static getFloatingWindows(children?: ReactNode) {
        const childComponents:FloatWindow[] = [];
        React.Children.forEach(
            children,
            (child,ii) => {
                if (FloatWindow.prototype === (child as any)?.type?.prototype) {
                    childComponents.push(child as FloatWindow);
                }
            });
        return childComponents;
    }

    private static refreshPerChild<T>(items:{[id:string]: T}, childs: FloatWindow[], builder: (child: FloatWindow, id:string)=>T) {
        const done = {};
        for(const child of childs) {
            const wid = (child as any).key;
            done[wid] = true;
            if (Object.prototype.hasOwnProperty.call(items, wid)) {
                continue;
            }
            items[wid] = builder(child, wid);
        }
        for(const id of Object.keys(items)) {
            if (!Object.prototype.hasOwnProperty.call(done, id)) {
                delete items[id];
            }
        }
    }

    render() {
        const windows = FloatContainer.getFloatingWindows(this.props.children);

        FloatContainer.refreshPerChild(this.childRefs, windows, React.createRef);
        FloatContainer.refreshPerChild(this.childResizeHandlers, windows, (child, key)=>(w, h)=>this.onChildResize(key, w, h));
        FloatContainer.refreshPerChild(this.childContext, windows, (child,key)=> ({
            deltaMove: (dx, dy)=>this.moveChild(key, dx, dy)
        }));

        return (<div style={{
            position: "relative",
            pointerEvents: "none",
            left: 0,
            top: 0,
            width: "100%",
            height: "100%"
        }}>
            <ReactResizeDetector handleWidth handleHeight onResize={this.onParentResize} />

            {windows.map(w=> {
                const wid = (w as any).key;
                
                // FIXME: prevent displaying until size has been received
                return (
                    <FloatContainer.Context.Provider value={this.childContext[wid]} key={wid}>
                        <div style={{pointerEvents: "auto", display: "inline-block", position: "absolute"}} ref={this.childRefs[wid]}>
                            <div>Title</div>
                            {w}
                        </div>
                    </FloatContainer.Context.Provider>
                )
            })}

            </div>);
    }

}