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
import { FullState as TypesFullState, ImageDetails, ImageSize, LevelId, Rectangle, SubFrame } from './Types';
import { ImageDisplay } from './ImageDisplay';
import ContextMenuContext, { OpenTrigger } from './ContextMenuContext';
import ContextMenuDisplayer from './ContextMenuDisplayer';
import ContextMenuItem from './ContextMenuItem';

const logger = Log.logger(__filename);


export type FullState = TypesFullState;

export type ContextMenuEntry = {
    title: string;
    uid: string;
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

    static readonly lowHelp= Help.key('Low level', "Define the low bound for the image rendering curve (relative to histogram, 50% is the mean value)");
    static readonly mediumHelp= Help.key('Median level', "Define the medium value for the image rendering curve (relative to histogram, 50% is the mean value)");
    static readonly highHelp= Help.key('High level', "Define the high bound for the image rendering curve (relative to histogram, 50% is the mean value)");
    static readonly fwhmHelp= Help.key('FWHM', "Locate stars and display the mean FWHM");
    static readonly histogramHelp =Help.key('Histogram', "Display histogram for the image");
    static readonly crosshairHelp =Help.key('Crosshair', "Display crosshair over the image");


    showLow= ()=>this.displaySetting('low');
    showMedium= () => this.displaySetting('medium');
    showHigh= () => this.displaySetting('high');
    showFwhm= () => this.displaySetting('fwhm');
    showHistogram = () => this.displaySetting('histogram');
    showCrosshair = () => this.displaySetting('crosshair');


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

    closeMenu = ()=> {
        this.setState({contextmenu: null});
    }

    declareChild=()=>{
        logger.debug('declareChild called');
        return undefined;
    }

    render() {
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
                <ContextMenuContext open={this.state.contextmenu} close={this.closeMenu}>
                    <div className='FitsViewOverlayContainer'>
                        <div className='FitsView' ref={this.el}>
                            <ReactResizeDetector handleWidth handleHeight onResize={this.onResize} />
                        </div>
                        {this.props.children}
                        <div className='FitsViewLoading'/>
                        {histogramView}
                        <ContextMenuDisplayer>
                            {
                                (trigger: OpenTrigger, entries: ContextMenuEntry[]) =>
                                    entries.filter(e=>e.positional).length === 0
                                        ? null
                                        : <ContextMenuCross
                                                x={trigger.x}
                                                y={trigger.y}/>
                            }
                        </ContextMenuDisplayer>

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
                        <ContextMenuDisplayer>
                            {
                                (trigger: OpenTrigger, entries: ContextMenuEntry[]) =>
                                    <ContextMenu
                                            contextMenu={entries}
                                            x={trigger.x} y={trigger.y}
                                            xlateCoords={this.xlateCoords}
                                            displaySetting={this.displaySetting}
                                    />
                            }
                        </ContextMenuDisplayer>

                        <ContextMenuItem
                            title='Low level'
                            uid='ViewSetting/0001'
                            helpKey={FitsViewer.lowHelp}
                            cb={this.showLow} />
                        <ContextMenuItem
                            title='Median'
                            uid='ViewSetting/0002'
                            helpKey={FitsViewer.mediumHelp}
                            cb={this.showMedium} />
                        <ContextMenuItem
                            title='High level'
                            uid='ViewSetting/0003'
                            helpKey={FitsViewer.highHelp}
                            cb={this.showHigh} />
                        <ContextMenuItem
                            title='Histogram'
                            uid='ViewSetting/0004'
                            helpKey={FitsViewer.histogramHelp}
                            cb={this.showHistogram} />
                        <ContextMenuItem
                            title='FWHM'
                            uid='ViewSetting/0005'
                            helpKey={FitsViewer.fwhmHelp}
                            cb={this.showFwhm} />
                        <ContextMenuItem
                            title='Crosshair'
                            uid='ViewSetting/0006'
                            helpKey={FitsViewer.crosshairHelp}
                            cb={this.showCrosshair} />
                    </div>
                </ContextMenuContext>
            </FitsViewer.ViewContext.Provider>);
    }

}

export default FitsViewer;