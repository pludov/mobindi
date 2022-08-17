import React, { Component, PureComponent, ReactElement} from 'react';
import $ from 'jquery';
import Log from '../shared/Log';
import * as Obj from '../shared/Obj';
import * as Help from '../Help';
import './FitsViewer.css'
import ContextMenu from './ContextMenu';
import LevelBar from './LevelBar';
import FWHMDisplayer from './FWHMDisplayer';
import ContextMenuCross from './ContextMenuCross';
import ReactResizeDetector from 'react-resize-detector';
import Histogram from './Histogram';
import FloatContainer from '../FloatContainer';
import FloatWindow from '../FloatWindow';
import FloatWindowMover from '../FloatWindowMover';
import { FullState as TypesFullState, ImageDetails, ImageSize, LevelId, Levels, Rectangle, SubFrame } from './Types';
import { ImageDisplay } from './ImageDisplay';

const logger = Log.logger(__filename);


export type FullState = TypesFullState;

export type ContextMenuEntry = {
    title: string;
    key: string;
    cb: (e:ContextMenuEvent)=>(void);
    positional?: boolean;
    helpKey: Help.Key;
}

export type ContextMenuEvent = {
    x: number;
    y: number;
    imageX?: number;
    imageY?: number;
}


let uid:number = 0;

export type Props = {
    path: string|null;
    streamId: string|null;
    streamSerial: string|null;
    subframe?: SubFrame|null;
    streamDetails: ImageDetails|null;
    viewSettings?: Partial<FullState>;
    contextMenu?: ContextMenuEntry[];
    directPort: number;
    onViewSettingsChange: (state: FullState)=>(void);
};

export type State = {
    contextmenu: {x:number, y:number}|null;
    histogramView: null|LevelId;
    histogramWindow: boolean;
    fwhm: boolean;
};

export class MarkerToken {
    private readonly el: React.RefObject<HTMLDivElement>;
    private readonly fv: FitsViewer;
    private readonly uid: string;
    private imgx:number;
    private imgy:number;
    private pos?: Rectangle;
    private size?: ImageSize;

    constructor(fv: FitsViewer, uid:string, el: React.RefObject<HTMLDivElement>) {
        this.el = el;
        this.fv = fv;
        this.uid = uid;
        this.imgx = NaN;
        this.imgy = NaN;
        logger.debug('new marker', {uid});
    }

    private doSetPosition=()=>{
        if (this.pos === undefined || this.size === undefined) {
            return;
        }
        if (isNaN(this.imgx) || isNaN(this.imgy)) {
            return;
        }
        const elem = this.el.current;
        if (elem === null) {
            return;
        }

        let pos = this.size.width >= 1 && this.size.height >= 1
            ?
                {
                    x: this.pos.x + this.imgx * this.pos.w / this.size.width,
                    y: this.pos.y + this.imgy * this.pos.h / this.size.height,
                }
            :
                {
                    x: this.imgx,
                    y: this.imgy,
                };
        elem.style.left = pos.x + "px";
        elem.style.top = pos.y + "px";
    }

    public setPosition=(x:number, y:number)=>{
        this.imgx = x;
        this.imgy = y;
        this.doSetPosition();
    }

    free=()=>{
        this.fv.killMarker(this.uid);
    }

    updatePos=(pos?: Rectangle, size?: ImageSize)=>{
        this.pos = pos;
        this.size = size;
        this.doSetPosition();
    }
}

export type FitsViewerContext = {
    declareChild:(e:React.RefObject<HTMLDivElement>)=>MarkerToken|undefined;
};

class FitsViewer extends React.PureComponent<Props, State> {
    imageDisplay: ImageDisplay;
    $el: JQuery<HTMLDivElement>;
    el: React.RefObject<HTMLDivElement> = React.createRef();
    private readonly instanceContext: FitsViewerContext;

    constructor(props: Props) {
        super(props);
        this.state = {
            contextmenu: null,
            histogramView: null,
            fwhm: false,
            histogramWindow: false,
        };
        this.instanceContext = {
            declareChild: this.createMarkerToken
        };
        // FIXME: persist state : histogram is visible
    }

    static readonly ViewContext = React.createContext<FitsViewerContext>({declareChild:()=>undefined});

    componentDidUpdate(prevProps: Props) {
        this.imageDisplay.setFullState(this.props.path, this.props.streamId, this.props.streamSerial, this.props.subframe||null, this.props.directPort, this.getViewSettingsCopy(), this.props.streamDetails || undefined);
    }

    componentDidMount() {
        this.$el = $(this.el.current!);
        this.imageDisplay = new ImageDisplay(this.$el,
            this.openContextMenu.bind(this),
            this.closeContextMenu.bind(this),
            this.onViewMoved);
        this.imageDisplay.setFullState(this.props.path, this.props.streamId, this.props.streamSerial, this.props.subframe||null, this.props.directPort, this.getViewSettingsCopy(), this.props.streamDetails || undefined);
    }

    private markers: {[uid:string]: MarkerToken} = {};
    private markerUid:number = 0;
    private lastPos?: Rectangle;
    private lastSize?: ImageSize;

    onViewMoved=(pos: Rectangle, size: ImageSize)=>{
        this.lastPos = {...pos};
        this.lastSize = {...size};
        for(const o of Object.keys(this.markers)) {
            const marker = this.markers[o];
            marker.updatePos(this.lastPos, this.lastSize);
        }
    }

    createMarkerToken=(e:React.RefObject<HTMLDivElement>)=>{
        const uid = "" + (this.markerUid++);
        const ret = new MarkerToken(this, uid, e);
        this.markers[uid] = ret;
        ret.updatePos(this.lastPos, this.lastSize);
        return ret;
    }

    killMarker=(uid:string)=>{
        delete this.markers[uid];
    }

    componentWillUnmount() {
        if (this.imageDisplay) {
            this.imageDisplay.dispose();
        }
        (this as any).ImageDisplay = undefined;
        (this as any).$el = undefined;
    }

    openContextMenu(x:number, y:number) {
        this.setState({contextmenu:{x, y}});
    }

    closeContextMenu(x:number, y:number) {
        if (this.state.contextmenu !== null) {
            this.setState({contextmenu:null});
        }
    }

    onViewSettingsChange(state:FullState)
    {
        this.props.onViewSettingsChange(state);
    }

    private readonly displaySetting=(which: LevelId|"fwhm"|"histogram"|"crosshair"|null)=>{
        if (which === "histogram") {
            this.setState({contextmenu: null, histogramWindow: !this.state.histogramWindow});
        } else if (which === 'fwhm') {
            this.setState({contextmenu: null, histogramView: null, fwhm: true});
        } else if (which === 'crosshair') {
            this.switchCrosshair();
            this.setState({contextmenu: null});
        } else {
            this.setState({contextmenu: null, histogramView: (this.state.histogramView === which ? null : which), fwhm: false});
        }
    }

    getViewSettingsCopy(): FullState
    {
        let propValue:any = this.props.viewSettings;
        if (propValue === undefined) {
            propValue = {};
        }
        propValue = Obj.deepCopy(propValue);
        if (!('levels' in propValue)) {
            propValue.levels = {};
        }
        if (!('low' in propValue.levels)) propValue.levels.low = 0.05;
        if (!('medium' in propValue.levels)) propValue.levels.medium = 0.5;
        if (!('high' in propValue.levels)) propValue.levels.high = 0.95;

        return propValue as FullState;
    }

    updateHisto = (which: string, v:number)=>{
        var newViewSettings = this.getViewSettingsCopy();
        newViewSettings.levels[which] = v;

        this.props.onViewSettingsChange(newViewSettings);
    }

    switchCrosshair = ()=> {
        var newViewSettings = this.getViewSettingsCopy();
        newViewSettings.crosshair = !newViewSettings.crosshair;
        this.props.onViewSettingsChange(newViewSettings);
    }

    flushView() {
        if (this.imageDisplay !== undefined) {
            this.imageDisplay.flushView();
        }
    }

    xlateCoords=(x:number, y:number)=> {
        if (this.imageDisplay !== undefined) {
            return this.imageDisplay.getImagePosFromParent(x, y);
        }
        return null;
    }

    onResize = () => {
        if (this.imageDisplay !== undefined) {
            this.imageDisplay.onResize();
        }
    }

    declareChild=()=>{
        logger.debug('declareChild called');
        return undefined;
    }

    render() {
        var contextMenu, visor;
        if (this.state.contextmenu !== null) {
            contextMenu = <ContextMenu
                            contextMenu={this.props.contextMenu}
                            x={this.state.contextmenu.x} y={this.state.contextmenu.y}
                            xlateCoords={this.xlateCoords}
                            displaySetting={this.displaySetting}
            />
            if (this.props.contextMenu && this.props.contextMenu.filter(e=>e.positional).length) {
                visor = <ContextMenuCross
                            x={this.state.contextmenu.x}
                            y={this.state.contextmenu.y}/>
            }
        } else {
            contextMenu = null;
            visor = null;
        }
        var histogramView;
        if (this.state.histogramView !== null) {
            var viewSettings = this.getViewSettingsCopy();
            histogramView = <LevelBar
                    property={this.state.histogramView}
                    onChange={this.updateHisto}
                    onFinishMove={this.flushView}
                    value={viewSettings.levels[this.state.histogramView]}/>;
        } else if (this.state.fwhm) {
            histogramView = <FWHMDisplayer path={this.props.path} streamId={this.props.streamId}/>
        } else {
            histogramView = null;
        }

        return(
            <FitsViewer.ViewContext.Provider value={this.instanceContext}>

                <div className='FitsViewOverlayContainer'>
                    <div className='FitsView' ref={this.el}>
                        <ReactResizeDetector handleWidth handleHeight onResize={this.onResize} />
                    </div>
                    {this.props.children}
                    <div className='FitsViewLoading'/>
                    {histogramView}
                    {visor}

                    <FloatContainer>
                        {this.state.histogramWindow
                            ?
                                <FloatWindow key="fits_view_overlay">
                                    <FloatWindowMover>
                                        <Histogram
                                            path={this.props.path}
                                            streamId={this.props.streamId}
                                            streamSerial={this.props.streamSerial}
                                            />
                                    </FloatWindowMover>
                                </FloatWindow>
                            :
                                null
                        }


                    </FloatContainer>

                    {contextMenu}
                </div>
            </FitsViewer.ViewContext.Provider>);
    }

}

export default FitsViewer;