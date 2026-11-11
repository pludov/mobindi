import React, { ReactNode} from 'react';
import Log from './shared/Log';
import FloatWindow from './FloatWindow';
import ReactResizeDetector from 'react-resize-detector';
import { has } from './Utils';
import ContextMenuContext, { OpenTrigger } from './FitsViewer/ContextMenuContext';
import ContextMenuDisplayer from './FitsViewer/ContextMenuDisplayer';
import ContextMenu from './FitsViewer/ContextMenu';
import { ContextMenuEntry } from './FitsViewer/FitsViewer';
import * as GenericUiStore from './GenericUiStore';

const logger = Log.logger(__filename);

type Props = {
    persistencePrefix?: string;
}

type State = {
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

    openContextMenu: (cx: number, dy:number)=>void;
    closeContextMenu: ()=>void;

    register :() => void;
    unregister: () => void;

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
    private childContextMenus: {[id:string]: React.RefObject<ContextMenuContext>} = {};
    private childResizeHandlers : {[id:string]: (w:number, h:number)=>void} = {};
    private childSizes: {[id: string]: Size|undefined} = {};
    private childContext: {[id: string]: FloatContainerContext} = {};

    private childPrefs: {[id: string]: Pref } = {};
    private parentSize = {width: 0, height: 0};
    private childKnownCount: {[id: string]: number} = {};
    private childRestoreFrames: {[id: string]: number} = {};

    public static Context = React.createContext<FloatContainerContext>({
        deltaMove: ()=>{}, 
        deltaMoveEnd:()=>{}, 
        openContextMenu: (cx: number, dy:number)=>{},
        closeContextMenu: ()=>{},
        register: ()=>{},
        unregister: ()=>{}
    });

    constructor(props:Props) {
        super(props);
        this.state = {
            contextMenuOpenFor: undefined,
            contextMenuOpenedLocation: undefined
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
    }

    componentWillUnmount() {
        for (const id of Object.keys(this.childRestoreFrames)) {
            window.cancelAnimationFrame(this.childRestoreFrames[id]);
        }
        this.childRestoreFrames = {};
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

    getChildPos(id: string) {
        const item = this.childRefs[id]?.current;
        if (item) {
            return {x: item.offsetLeft, y: item.offsetTop};
        }
        return undefined;
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

        if (has(this.childPrefs, id)) {
            let p = this.childPrefs[id];
            if (p.x !== undefined && p.y !== undefined) {
                console.log('Commiting float position for id:', id, 'to', p);
                GenericUiStore.updateComponentState<Position>(
                    this.props.persistencePrefix ? `${this.props.persistencePrefix}.${id}` : id,
                    {
                        x: p.x,
                        y: p.y
                    }
                );
            }
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
        const done: {[id:string]: boolean} = {};
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

    openContextMenu=(id:string, cx:number, cy:number)=>{
        
        let p = this.getChildPos(id);
        // Convert to container's location
        if (!p) {
            console.warn('No position found for', id);
            return;
        }

        this.childContextMenus[id]?.current?.open?.({x: p.x + cx, y: p.y + cy});
    }

    closeContextMenu=(id:string)=>{
        this.childContextMenus[id]?.current?.close?.();
    }

    registerChild = (id: string) => {
        this.childKnownCount[id] = (this.childKnownCount[id] || 0) + 1;
        if (this.childKnownCount[id] === 1) {
            let newPos = GenericUiStore.initComponentState<Position|undefined>(
                this.props.persistencePrefix ? `${this.props.persistencePrefix}.${id}` : id,
                e=>e
            );

            if (!this.childPrefs[id]) {
                this.childPrefs[id] = {};
            }

            if (newPos) {
                this.childPrefs[id].x = newPos.x;
                this.childPrefs[id].y = newPos.y;
            }

            this.childRestoreFrames[id] = window.requestAnimationFrame(() => {
                delete this.childRestoreFrames[id];
                this.prefOp(id, ()=>{});
            });
        }
    }

    unregisterChild = (id: string) => {
        if (this.childKnownCount[id]) {
            this.childKnownCount[id]--;
            if (this.childKnownCount[id] === 0) {
                if (has(this.childRestoreFrames, id)) {
                    window.cancelAnimationFrame(this.childRestoreFrames[id]);
                    delete this.childRestoreFrames[id];
                }
                delete this.childKnownCount[id];
                delete this.childRefs[id];
                delete this.childResizeHandlers[id];
                delete this.childContext[id];
                delete this.childContextMenus[id];
            }
        }
    }

    render() {
        const windows = FloatContainer.getFloatingWindows(this.props.children);

        FloatContainer.refreshPerChild(this.childRefs, windows, React.createRef);
        FloatContainer.refreshPerChild(this.childContextMenus, windows, React.createRef);
        FloatContainer.refreshPerChild(this.childResizeHandlers, windows, (child, key)=>(w, h)=>this.onChildResize(key, w, h));
        FloatContainer.refreshPerChild(this.childContext, windows, (child,key)=> ({
            deltaMove: (dx, dy)=>this.moveChild(key, dx, dy),
            deltaMoveEnd: ()=>this.commitChild(key),
            openContextMenu: (cx, cy)=>this.openContextMenu(key, cx, cy),
            closeContextMenu: ()=>this.closeContextMenu(key),
            register: () => this.registerChild(key),
            unregister: () => this.unregisterChild(key),
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
                <ContextMenuContext>
                    {windows.map(w=> {
                        const wid = (w as any).key;
                        
                        // FIXME: prevent displaying until size has been received
                        return (
                            <ContextMenuContext key={wid} ref={this.childContextMenus[wid]}>
                                <FloatContainer.Context.Provider value={this.childContext[wid]} key={wid}>
                                    <div style={{pointerEvents: "auto", display: "inline-block", position: "absolute"}} ref={this.childRefs[wid]}>
                                        {w}
                                    </div>
                                </FloatContainer.Context.Provider>
                                
                                <ContextMenuDisplayer>
                                    {
                                        (trigger: OpenTrigger, entries: ContextMenuEntry[]) =>
                                            <ContextMenu
                                                    contextMenu={entries}
                                                    x={trigger.x} y={trigger.y}
                                                    xlateCoords={()=>null}
                                                    displaySetting={()=>{}}
                                            />
                                    }
                                </ContextMenuDisplayer>

                            </ContextMenuContext>
                        )
                    })}
                </ContextMenuContext>
            </div>);
    }

}