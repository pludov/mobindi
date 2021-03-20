import React, { Component, PureComponent, ReactNode} from 'react';
import Log from './shared/Log';
import FloatWindow from './FloatWindow';
import ReactResizeDetector from 'react-resize-detector';
import { has } from './Utils';

const logger = Log.logger(__filename);

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
    // Prefered pos (uncliped)
    x?: number;
    y?: number;
    // Last drag pos (uncliped)
    dragx?: number;
    dragy?: number;
}

export type FloatContainerContext = {
    deltaMove:(dx:number, dy:number)=>void;
    deltaMoveEnd: ()=>void;
}

function fit(x:number, size: number, max?:number) {
    if (max !== undefined && x + size >  max) {
        x = max - size;
    }
    if (x < 0) {
        x = 0;
    }
    return x;
}

export default class FloatContainer extends React.PureComponent<Props, State> {
    private childRefs: {[id:string]: React.RefObject<HTMLDivElement>} = {};
    private childResizeHandlers : {[id:string]: (w:number, h:number)=>void} = {};
    private childSizes: {[id: string]: Size|undefined} = {};
    private childContext: {[id: string]: FloatContainerContext} = {};

    private childPrefs: {[id: string]: Pref } = {};
    private parentSize = {width: 0, height: 0};

    public static Context = React.createContext<FloatContainerContext>({deltaMove: ()=>{}, deltaMoveEnd:()=>{}});

    constructor(props:Props) {
        super(props);
        this.state = {
            pos: {}
        };
    }

    // Adjust div pos according to size constraints
    relayout() {
        logger.debug('relayout', {childSizes: this.childSizes});
        // For every child that has a size, make sure it fits within parent area
        for(const id of Object.keys(this.childRefs)) {
            this.prefOp(id, ()=>{});
        }
    }

    componentDidMount() {
        // relayout();
    }

    componentWillReceiveProps() {
        // FIXME: invalidate sizes
    }

    onParentResize=(width:number, height:number)=> {
        logger.debug('onResize');
        this.parentSize = {width, height};
        this.relayout();
    }

    onChildResize=(id:string, w: number, h: number)=>{
        this.childSizes[id] = {w, h};
    }

    prefOp=(id:string, op: (pref:Pref, item: HTMLDivElement)=>void)=>{
        const item = this.childRefs[id]?.current;
         
        if (item) {
            if (!has(this.childPrefs, id)) {
                this.childPrefs[id] = {};
            }
            const pref = this.childPrefs[id];

            op(pref, item);

            if (pref.x !== undefined) {
                item.style.left = fit(pref.x, item.clientWidth, this.parentSize.width) + "px";
            }
            if (pref.y !== undefined) {
                item.style.top = fit(pref.y, item.clientHeight, this.parentSize.height) + "px";
            }
        }
    }

    moveChild=(id:string, dx: number, dy: number)=> {
        this.prefOp(id, (pref, item)=>{
            if (pref.x === undefined) {
                pref.x = item.offsetLeft;
            }
            if (pref.y === undefined) {
                pref.y = item.offsetTop;
            }

            if (pref.dragx === undefined) {
                pref.dragx = item.offsetLeft;
            }
            if (pref.dragy === undefined) {
                pref.dragy = item.offsetTop;
            }

            pref.dragx += dx;
            pref.dragy += dy;
            pref.x = pref.dragx;
            pref.y = pref.dragy;
        });
    }

    commitChild=(id:string)=>{
        this.prefOp(id, (pref, item)=>{
            pref.dragx = undefined;
            pref.dragy = undefined;
        });
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
            deltaMove: (dx, dy)=>this.moveChild(key, dx, dy),
            deltaMoveEnd: ()=>this.commitChild(key),
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
                            {w}
                        </div>
                    </FloatContainer.Context.Provider>
                )
            })}

            </div>);
    }

}