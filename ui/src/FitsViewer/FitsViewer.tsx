
import React, { Component, PureComponent, ReactElement} from 'react';
import $ from 'jquery';
import Log from '../shared/Log';
import * as Obj from '../shared/Obj';
import * as Help from '../Help';
import './FitsViewer.css'
import MouseMoveListener from '../MouseMoveListener';
import ContextMenu from './ContextMenu';
import LevelBar from './LevelBar';
import FWHMDisplayer from './FWHMDisplayer';
import BaseApp from 'src/BaseApp';
import ContextMenuCross from './ContextMenuCross';
import ReactResizeDetector from 'react-resize-detector';
import Histogram from './Histogram';
import FloatContainer from '../FloatContainer';
import FloatWindow from '../FloatWindow';
import FloatWindowMover from '../FloatWindowMover';
import Crosshair from './Crosshair';
import { EventEmitter } from 'events';

const logger = Log.logger(__filename);


export type LevelId = "low"|"medium"|"high";

type ImageSize = {
    width: number;
    height: number;
}

type Rectangle = {
    x: number;
    y: number;
    w: number;
    h: number;
}

function intersect(r1: Rectangle, r2: Rectangle) {
    if (r1.x >= r2.x + r2.w) return false;
    if (r1.y >= r2.y + r2.h) return false;
    if (r2.x >= r1.x + r1.w) return false;
    if (r2.y >= r1.y + r1.h) return false;
    
    return true;
}

export type Levels = {
    low: number;
    medium: number;
    high: number;
}

export type FullState = {
    levels: Levels;
    crosshair?: boolean;
}

type ImagePos = {
    x:number;
    y:number;
    w:number;
    h:number;
}

// When content is actually a subframe
// Gives actual margin in 0-1 range
type Window = {
    top: number;
    left: number;
    bottom: number;
    right: number;
};

type CompleteImagePos = ImagePos & {
    centerx: number;
    centery: number;
    zoomToBestfit: number;
};

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

const imageReleaseUrl = "about:blank";

type ImageParameter = {
    // Path to the image
    path: string;
    // Serial (for streams)
    serial: string|null;
    
    // FIXME: size for streams

    // levels
    levels: Levels;
    // Position of the actual data in the image
    window: Window|null;
}

type ImageExposure = {
    // Target display area
    displaySize: ImageSize;
    // Actual portion of the image beeing displayed
    imagePos: ImagePos;
}

class ImageDetailQuery {
    path: string;
    ajax: JQueryXHR|null = null;
    listeners: Array<{id: Object, cb: (w: ImageSize|null)=>void}> = [];

    constructor(path: string) {
        this.path = path;
    }

    register(id: Object, cb: (w: ImageSize|null)=>void) {
        return new Promise((res, rej)=> {
            this.listeners.push({
                id,
                cb
            });
        });
    }

    // This will abort if last registered unregister
    unregister(id: Object) {
        for(let i = 0 ; i < this.listeners.length;) {
            if (this.listeners[i].id === id) {
                this.listeners.splice(i, 1);
            } else {
                i++;
            }
        }
        if (this.listeners.length === 0 && this.ajax !== null) {
            const ajax = this.ajax;
            // This will prevent call of cb
            this.ajax = null;
            ajax.abort();
        }
    }

    broadcast(rslt: ImageSize|null) {
        for(const target of [...this.listeners]) {
            target.cb(rslt);
        }
    }

    start() {
        this.ajax = $.ajax({
            url: 'fitsviewer/fitsviewer.cgi?size=true&' + this.path,
            dataType: 'json',
            error: (e)=>{
                if (this.ajax !== null) {
                    logger.error('size query had error', {path: this.path}, e);
                    this.ajax = null;
                    this.broadcast(null);
                }
            },
            success: (d)=> {
                if (this.ajax !== null) {
                    logger.debug('size query done', {path: this.path, d});
                    this.ajax = null;
                    this.broadcast(d);

                }
            },
            timeout: 30000
        });
    }
}

function getBestFitForSize(imageSize:ImageSize, viewSize: { width: number, height: number}) {
    const defaults = {
        centerx: 0.5,
        centery: 0.5,
        zoomToBestfit: 1.0,
    }

    if (imageSize.width == 0
        || imageSize.height == 0
        || viewSize.width == 0
        || viewSize.height == 0)
    {
        // Don't bother
        return {x: 0, y:0, w: viewSize.width, h: viewSize.height, ...defaults};
    }
    // If image is larger than view
    // imageSize.x / imageSize.y > viewSize.x / viewSize.y
    // imageSize.x * viewSize.y > viewSize.x * imageSize.y
    else if (imageSize.width * viewSize.height > viewSize.width * imageSize.height) {
        // scale for width and adjust height
        const heightInClient = viewSize.width * imageSize.height / imageSize.width;
        return {x: 0, y:(viewSize.height - heightInClient) / 2, w: viewSize.width, h: heightInClient, ...defaults};
    } else {
        // Scale for height and adjust width
        const widthInClient = viewSize.height * imageSize.width / imageSize.height;
        return {x: ((viewSize.width - widthInClient) / 2), y:0, w: widthInClient, h: viewSize.height, ...defaults};
    }
}

type TileStatus = {
    loading: boolean;
    error: boolean;
    rendered: boolean;
}

class Tile {
    loader: ImageLoader;
    img: HTMLImageElement|null = null;
    
    // Base url for the content
    srcBase: string;

    bin: number;

    // Position in image x0, y0, x1, y1
    pos: number[];

    // Position relative to display
    displayRect: Rectangle;

    status : TileStatus = { loading: false, error: false, rendered: false};
    // Reserved for tracking by loader
    prevStatus: TileStatus | undefined;

    // Set by loader, for purpose of ordering load
    dstToCenter: number = 0;

    constructor(loader: ImageLoader, src: string, bin: number, pos: number[])
    {
        this.loader = loader;
        this.srcBase = src;
        this.bin = bin;
        this.pos = pos;
    }

    setDisplayRect(displayRect: Rectangle) {
        this.displayRect = displayRect;

        const img = this.img;
        if (!img) return;
        const jqimg = $(img);
        jqimg.css('left', this.displayRect.x + 'px');
        jqimg.css('top',  this.displayRect.y + 'px');
         
        jqimg.css("width", (this.displayRect.w + 0.01) + 'px');
        jqimg.css("height", (this.displayRect.h + 0.01) + 'px');
    }

    startLoading() {
        // load the content of the image
        this.img = new Image();
        this.img.src = this.srcBase + `&x0=${this.pos[0]}&y0=${this.pos[1]}&x1=${this.pos[2]}&y1=${this.pos[3]}`;
        this.img.addEventListener("load", this.imageElementLoaded);
        this.img.addEventListener("error", this.imageElementFailed);
        this.img.id = "image loader img";
        $(this.img).css('display', 'block');
        $(this.img).css('pointer-events', 'none');
        $(this.img).css('box-sizing', 'border-box');
        $(this.img).css('border', '0px');
        $(this.img).css('position', 'absolute');
        $(this.img).css('image-rendering',  'pixelated');

        this.setDisplayRect(this.displayRect);

        this.status.loading = true;
        this.status.rendered = false;
        this.status.error = false;
    }

    imageElementLoaded=()=> {
        logger.error('imageloader => loading finished');
        this.status.loading = false;
        this.status.rendered = true;
        this.status.error = false;

        this.loader.updateStatus(this);
    }
    
    imageElementFailed=(e: any)=>{
        logger.error('imageloader => loading failed', e);
        this.status.loading = false;
        this.status.rendered = true;
        this.status.error = true;

        this.loader.updateStatus(this);
    }

    dispose() {
        // Abort loading
        // Drop from the tile set
        if (this.img) {
            this.img.removeEventListener("load", this.imageElementLoaded);
            this.img.removeEventListener("error", this.imageElementFailed);
            this.img.src = imageReleaseUrl;
            if (this.img.parentNode != null) {
                this.img.parentNode!.removeChild(this.img);
            }
            this.img = null;
        }
    }
}

class TilePlane {
    tiles: Array<Tile>;
    bin: number;
    tileSize: number;
    nbTileX: number;
    nbTileY: number;
    details: ImageSize;
    root: HTMLSpanElement;
    baseSrc: string;

    constructor(imageLoader : ImageLoader, details: ImageSize, bin: number, baseSrc:string) {
        this.details = details;
        this.bin = bin;
        this.baseSrc = baseSrc;

        // Construct a full tile plane
        this.tileSize = 256 * (2 ** bin);
        this.nbTileX = Math.ceil(this.details!.width / this.tileSize);
        this.nbTileY = Math.ceil(this.details!.height / this.tileSize);

        this.root = document.createElement("span");

        this.tiles = [];
        for(let ty = 0; ty < this.nbTileY; ++ty)
            for(let tx = 0; tx < this.nbTileX; ++tx)
            {
                const x0 = tx * this.tileSize;
                const y0 = ty * this.tileSize;
                const x1 = clipToBin(x0 + this.tileSize - 1, this.details.width, bin);
                const y1 = clipToBin(y0 + this.tileSize - 1, this.details.height, bin);

                const tile = new Tile(imageLoader, baseSrc, bin, [x0, y0, x1, y1]);

                this.tiles[tx + ty * this.nbTileX] = tile;
            }
    }    

    dispose() {
        if (this.root && this.root.parentNode != null) {
            this.root.parentNode!.removeChild(this.root);
        }
        for(const tile of this.tiles) {
            tile.dispose();
        }
    }
}


// Clip the last pixel of a tile, so it ends at most at the end of the "bin" of the last pixel
// end of tile must no go beyond actual image, 
// but must still stop at a complete bin (so this give a little overflow on the initial image)
function clipToBin(v:number, vmax:number, bin:number) {
    if (v >= vmax) {
        v = vmax - 1;
    }
    const binSize =2 ** bin
    
    const binLeft = (binSize - 1 ) - (v % binSize);
    
    v += binLeft;
    
    return v;
}

/* ImageLoader event lifecycle is:
 *    prepare => sized 
 *    expose => rendered
 *
 *   calling expose before visible will cancel pending visibility events
 */
class ImageLoader {
    param: ImageParameter;
    exposure: ImageExposure|undefined;

    // True when loading to display
    loadingToDisplay: boolean;

    // Will be set during loading
    details: ImageSize | null;
    // Will be set during loading
    src: string|null;

    detailsRequest: ImageDetailQuery|null = null;
    detailsLoaded: boolean = false;

    events: EventEmitter = new EventEmitter();

    // Target img element
    tiles: TilePlane|null = null;

    // Tiles to start loading
    pendingLoad: Array<Tile> = [];
    // Current number of tiles beeing loaded
    loadingCount: number = 0;

    root: HTMLSpanElement;

    disposed: boolean = false;

    insertImg: (e: HTMLElement)=>void;

    constructor(param: ImageParameter) {
        this.param = param;
    }

    samePath(other: ImageLoader) {
        return this.param.path === other.param.path;
    }

    sameGeometry(other: ImageLoader) {
        if (!this.details) {
            return false;
        }
        if (!other.details) {
            return false;
        }

        return (this.details.width === other.details.width
                && this.details.height === other.details.height)
    }

    // Prepare a new rending. Take from previousLoader what can be taken
    // FIXME: what if previousLoader is visible ?
    prepare(previousLoader?: ImageLoader)
    {
        if (!this.root) {
            this.root = document.createElement("span");
            this.insertImg(this.root);
        }

        if (previousLoader
            && previousLoader.param.path === this.param.path
            && previousLoader.param.serial === this.param.serial)
        {
            // Recycle the loading

            if (previousLoader.detailsLoaded && !previousLoader.details) {
                // Loading failed. Don't recycle
                this.startDetailsRequest();
            } else {
                this.details = previousLoader.details;
                this.detailsLoaded = previousLoader.detailsLoaded;
                this.detailsRequest = previousLoader.detailsRequest;

                if (this.detailsRequest) {
                    this.detailsRequest.register(this, this.onDetailsLoaded);
                }

                // Wait for the load request to finish
                if (!this.detailsLoaded) {
                    return;
                } else {
                    // Let the caller initiate a load at the preferred bin
                    this.onDetailsLoaded(this.details);
                    if (this.disposed) {
                        return;
                    }
                }

                // compute the src.
                // If they are the same, recycle previousImageLoader

                // Else, create a new img element

            }
        } else {
            this.startDetailsRequest();
        }
    }

    startDetailsRequest() {
        this.detailsRequest = new ImageDetailQuery(this.encodePathUrl());
        this.detailsRequest.register(this, this.onDetailsLoaded);
        this.detailsRequest.start();
    }

    dispose()
    {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        if (!this.detailsLoaded && this.detailsRequest)  {
            this.detailsRequest.unregister(this);
            this.detailsRequest = null;
        }
        if (this.tiles) {
            this.tiles.dispose();
            this.tiles = null;
        }
        if (this.root && this.root.parentNode != null) {
            this.root.parentNode!.removeChild(this.root);
        }
    }

    computeSrc()
    {
        const imageSize = this.details!;
        const exposure = this.exposure!;
        let str;

        let bin = 16;

        if (exposure.imagePos.w > 0 && exposure.imagePos.h > 0
                && imageSize.width  > -1 && imageSize.height > -1)
        {
            bin = Math.floor(Math.min(
                imageSize.width / exposure.imagePos.w,
                imageSize.height / exposure.imagePos.h
            ));
        } else if (imageSize.width > 0 && imageSize.height > 0) {
            // Prepare for a best fit
            const bestFit = getBestFitForSize(imageSize, exposure.displaySize);
            bin = Math.floor(Math.min(
                imageSize.width / bestFit.w,
                imageSize.height / bestFit.h
            ));
        }

        if (window.devicePixelRatio) {
            bin *= window.devicePixelRatio;
        }

        // lower this to a 2^power
        bin = Math.floor(Math.log2(bin));
        if (bin < 0) {
            bin = 0;
        }

        if (JQImageDisplay.allowHttpFallback()) {
            str = "http://" + document.location.hostname + ":" + JQImageDisplay.directPort + (document.location.pathname.replace(/\/[^/]+/, '') || '/');
        } else {
            str = "";
        }
        str += 'fitsviewer/fitsviewer.cgi?bin=' + bin + '&' + this.encodePathUrl();
        str += '&low=' + this.param.levels.low;
        str += '&med=' + this.param.levels.medium;
        str += '&high=' + this.param.levels.high;
        if (this.param.serial !== null) {
            str += "&serial=" + encodeURIComponent(this.param.serial);
        }

        return {src: str, bin};
    }

    private encodePathUrl() {
        const path = this.param.path;
        if (path.startsWith("file:")) {
            return 'path=' + encodeURIComponent(path.substring(5));
        } else if (path.startsWith("stream:")) {
            return 'streamid=' + encodeURIComponent(path.substring(7));
        } else {
            throw new Error("invalid path: " + path);
        }
    }

    onDetailsLoaded = (details: ImageSize|null)=>{
        this.detailsLoaded = true;
        this.detailsRequest = null;
        this.details = details;
        console.log('ImageLoader got details', details)
        this.events.emit('sized', details);
        if (details === null && !this.disposed) {
            this.events.emit('statusChanged');
        }
    }

    // Ensure a rendered is dispatched as soon as all visible tiles get loaded
    private waitingForRendered: boolean = false;

    expose = (exposure: ImageExposure)=> {
        if (Obj.deepEqual(this.exposure, exposure)) {
            return;
        }

        this.exposure = exposure;

        if (!this.detailsLoaded) {
            return;
        }
        if (!this.details) {
            this.waitingForRendered = false;
            this.events.emit('rendered');
        } else {
            // TODO for tile rendering:
            // Compute the target bin
            // Create plane for the target bin if not exists
            // Remove any tile that is not covered by the actual exposure:
            //    totally out of exposure (with % margin )
            //    totally hidden by current loaded tile
            // Remark: if not displayed (not implemented), just drop all but the target tile
            // Start loading tiles in current bin, from center
            
            const {bin, src} = this.computeSrc();
            if (this.tiles && this.tiles.bin !== bin) {
                this.tiles.dispose();
                this.tiles = null;
            }

            if (!this.tiles) {
                this.tiles = new TilePlane(this, this.details!, bin, src);
                this.root.appendChild(this.tiles.root);
                this.waitingForRendered = true;
                this.events.emit('statusChanged');
                
                for(const tile of this.tiles.tiles)
                    this.placeTile(tile);
                this.controlTileLoading(src);

            } else {
                for(const tile of this.tiles.tiles)
                    this.placeTile(tile);
                this.controlTileLoading(src);
                this.waitingForRendered = false;
                this.events.emit('rendered');
            }
        }
    }

    controlTileLoading(src: string) {
        // Start loading the visible tiles:
        // those that intersect with [0, 0, displaySize[
        const displayRect = {
            x: -50,
            y: -50,
            w: 50 + this.exposure!.displaySize.width,
            h: 50 + this.exposure!.displaySize.height
        }

        const displayCenterX = this.exposure!.displaySize.width / 2;
        const displayCenterY = this.exposure!.displaySize.height / 2;

        this.pendingLoad = [];
        this.loadingCount = 0;
        
        for(const tile of this.tiles!.tiles) {
            if (tile.status.rendered) {
                continue;
            }
            if (tile.status.loading) {
                this.loadingCount++;
                continue;
            }
            const visible = intersect(tile.displayRect, displayRect);
            if (visible) {
                const tileCenterX = tile.displayRect.x + tile.displayRect.w / 2;
                const tileCenterY = tile.displayRect.x + tile.displayRect.w / 2;
                
                const tileDstX = Math.abs(tileCenterX - displayCenterX ) / displayCenterX;
                const tileDstY = Math.abs(tileCenterY - displayCenterY ) / displayCenterY;
    
                let dst = tileDstX*tileDstX + tileDstY*tileDstY;
                tile.dstToCenter = dst;
                this.pendingLoad.push(tile);
            }
        }
        // Sort according to distance to screen center
        this.pendingLoad.sort((a, b)=>(a.dstToCenter - b.dstToCenter));
        this.continueLoading();
    }

    continueLoading() {
        while (this.pendingLoad.length > 0 && this.loadingCount < 2) {
            const tile = this.pendingLoad[0];
            this.pendingLoad.splice(0, 1);
            this.loadingCount++;

            tile.startLoading();
            this.root.appendChild(tile.img!)
        }

        // FIXME : here we may have loaded all tiles... emit event ?
    }

    updateStatus(tile: Tile) {
        if (!tile.status.loading) {
            this.loadingCount--;
            this.continueLoading();
        }

        if (this.waitingForRendered) {
            // FIXME This is tooearly !
            // Need to emit two events: partially rendered + fully rendered
            if (tile.status.rendered) {
                this.waitingForRendered = false;
                this.events.emit('rendered');
            }
        }
        // TODO : Only emit for real changes (no more loading, all rendered, ...)
        if (!this.disposed)
            this.events.emit('statusChanged');
    }

    placeTile(tile: Tile)
    {
        const exposure = this.exposure!;
        
        const xPixelRatio = exposure.imagePos.w / this.details!.width;
        const yPixelRatio = exposure.imagePos.h / this.details!.height;
        
        const window = this.param.window;

        tile.setDisplayRect({
            x: (exposure.imagePos.x + ((window?.left|| 0) + tile.pos[0]) * xPixelRatio),
            y: (exposure.imagePos.y + ((window?.top || 0) + tile.pos[1]) * yPixelRatio),
            w: ((tile.pos[2] - tile.pos[0] + 1) * xPixelRatio),
            h: ((tile.pos[3] - tile.pos[1] + 1) * yPixelRatio),
        })
    }

    hadLoadingError() {
        if (this.detailsLoaded && !this.details) return true;
        if (!this.detailsLoaded) return false;
        if (this.tiles) {
            for(const tile of this.tiles.tiles) {
                if (tile.status.error) {
                    return true;
                }
            }
        }
        return false;
    }

    isLoading() {
        if ((this.detailsLoaded) && (!this.details)) return false;
        if (!this.detailsLoaded) return true;

        if (this.tiles) {
            for(const tile of this.tiles.tiles) {
                if (tile.status.loading) {
                    return true;
                }
            }
        }

        return false;
    }
}

class JQImageDisplay {

    // A completely loaded view that is currently displayed
    currentView: ImageLoader | null = null;
    // A loading view, possibly displayed during loading.
    // (!loadingView) || (!currentView) && loadingView.sameGeometry(currentView)
    loadingView: ImageLoader | null = null;

    // View to load once loading view is ready
    nextView: ImageLoader | null = null;


    // The path (without cgi settings)
    loadingToDisplay?:boolean = false;
    
    child:JQuery<HTMLDivElement>;
    
    levels: Levels;
    crosshairInstance: Crosshair|null;

    currentImagePos:CompleteImagePos = {x:0, y:0, w:0, h:0, centerx: 0.5, centery: 0.5, zoomToBestfit: 1};

    menuTimer:NodeJS.Timeout|null = null;
    static directPort: number = parseInt(document.location.port);

    closeContextMenuCb:()=>void;
    contextMenuCb:(x:number, y:number)=>void;
    posUpdatedCb:(pos: ImagePos, size: ImageSize)=>(void);

    mouseListener: MouseMoveListener;

    constructor(elt:JQuery<HTMLDivElement>, contextMenuCb:(x:number, y:number)=>void, closeContextMenuCb:()=>void, posUpdatedCb:(pos: ImagePos, size: ImageSize)=>(void)) {
        
        this.child = elt;
        this.contextMenuCb = contextMenuCb;
        this.closeContextMenuCb = closeContextMenuCb;
        this.posUpdatedCb = posUpdatedCb;
        elt.css('display', 'block');
        elt.css('width', '100%');
        elt.css('height', '100%');
        elt.css('overflow', 'hidden');

        this.mouseListener = new MouseMoveListener(elt, {
            zoom: this.zoom,
            drag:(dx:number, dy:number)=>this.setCurrentImagePos({
                x: this.currentImagePos.x + dx,
                y: this.currentImagePos.y + dy,
                w: this.currentImagePos.w,
                h: this.currentImagePos.h
            }),
            endDrag: ()=>{},
            openContextMenu: this.contextMenuCb,
            closeContextMenu: this.closeMenu,
        });

        this.levels = {
            low: 0.05,
            medium: 0.5,
            high: 0.95
        };

        this.crosshairInstance = null;
    }

    updateCrossHairPosition = ()=>{
        if (!this.crosshairInstance) {
            return;
        }
        let imagePos:ImagePos;

        if (this.currentImagePos) {
            imagePos = this.currentImagePos;
        } else {
            imagePos = {
                x: 0,
                y: 0,
                w: (this.child.width() || 0),
                h: (this.child.height() || 0),
            };
        }

        this.crosshairInstance.update(imagePos);
    }

    onResize = ()=>{
        const newSize = {x: this.child.width(), y:this.child.height() };
        if (newSize.x === undefined) return;
        if (newSize.y === undefined) return;

        const view = this.loadingView?.details ? this.loadingView : this.currentView;
        if (!view || !view.details) {
            // Force initalization of the image pos (for proper cross hair display)
            this.setCurrentImagePos({
                ...this.currentImagePos
            });
            return;
        }

        // const centerX = view.details!.width * this.currentImagePos.x;
        // const centerY = view.details!.height * this.currentImagePos.y;
        const bestFit = this.getBestFitForSize(view.details!);

        bestFit.w *= this.currentImagePos.zoomToBestfit;
        bestFit.h *= this.currentImagePos.zoomToBestfit;
        // Center at centerX, centerY
        bestFit.x  = newSize.x / 2 - bestFit.w * this.currentImagePos.centerx;
        bestFit.y  = newSize.y / 2 - bestFit.h * this.currentImagePos.centery;

        bestFit.centerx = this.currentImagePos.zoomToBestfit;
        bestFit.centery = this.currentImagePos.zoomToBestfit;
        bestFit.zoomToBestfit = this.currentImagePos.zoomToBestfit;

        this.setCurrentImagePos(bestFit);
    }

    dispose() {
        this.mouseListener.dispose();

        if (this.currentView) {
            this.disposeView(this.currentView);
            this.currentView = null;
        }
        if (this.loadingView) {
            this.disposeView(this.loadingView);
            this.loadingView = null;
        }
    }

    updateViewStyle= ()=> {
        // First the loading flag
        const loading = this.loadingView || (this.currentView && this.currentView.isLoading());
        const error = (!loading) && this.currentView && this.currentView.hadLoadingError();
        if (loading) {
            this.child.addClass('Loading');
        } else {
            this.child.removeClass('Loading');
        }

        if (error) {
            this.child.addClass('Error');
        } else {
            this.child.removeClass('Error');
        }
    }

    getFullState(): FullState
    {
        return {
            levels: {...this.levels},
            crosshair: !!this.crosshairInstance,
        }
    }

    static allowHttpFallback() {
        const env = process.env.NODE_ENV;
        if (document.location.protocol === 'https:' || env === 'development') {
            const raw = navigator.userAgent.match(/Chrom(e|ium)\/([0-9]+)\./);
            const chrome = raw ? parseInt(raw[2], 10) : false;

            if (chrome && chrome > 79) {
                return false;
            }
            return true;
        } else {
            return false;
        }
    }

    private windowEquals(w1 : Window|null, w2: Window|null) {
        if ((w1 === null) != (w2 === null)) {
            return false;
        }
        if (w1 === null || w2 === null) {
            return true;
        }
        return (w1.top === w2.top)
            && (w1.bottom === w2.bottom)
            && (w1.left === w2.left)
            && (w1.right === w2.right);
    }

    private applyWindow(img: HTMLImageElement, window: Window|null) {
        const jqimg = $(img);

        if (window !== null) {
            const h = jqimg.css("height");
            jqimg.css("padding-top", `calc( ${window.top} * ${h} )`);
            jqimg.css("padding-bottom", `calc( ${window.bottom} * ${h} )`);
            const w = jqimg.css("width");
            jqimg.css("padding-left", `calc( ${window.left} * ${w} )`);
            jqimg.css("padding-right", `calc( ${window.right} * ${w} )`);
        } else {
            jqimg.css("padding-top", "0");
            jqimg.css("padding-bottom", "0");
            jqimg.css("padding-left", "0");
            jqimg.css("padding-right", "0");
        }
    }

    // imageSize is expected only for streams
    setFullState(file: string|null, streamId:string|null, streamSerial: string|null, window: Window|null, directPort: number, params?:FullState, imageSize?: ImageSize) {
        // Don't display stream until ready
        if (streamId !== null && !imageSize) {
            streamId = null;
        }

        JQImageDisplay.directPort = directPort;

        const path = file ? "file:" + file : streamId ? "stream:" + streamId : null;

        if (params?.levels) {
            this.levels = params.levels;
        }

        if (params?.crosshair !== undefined) {
            if ((!!this.crosshairInstance) !== params.crosshair) {
                if (this.crosshairInstance) {
                    this.crosshairInstance.remove();
                    this.crosshairInstance = null;
                } else {
                    this.crosshairInstance = new Crosshair();
                    this.crosshairInstance.attach(this.child);
                    this.updateCrossHairPosition();
                }
            }
        }

        // When loading the same path, the code waits for the current load to finish before going to a new one
        // same path mean same image or same stream (so stream reload is never aborted, just skipping the serial update)
        // Otherwise, the current loading is aborted. 

        
        const loaderParam = {
            path: path || "file:void",
            serial: streamSerial,
            levels: params?.levels || {low: 0, medium: 0.5, high: 1},
            window,
        };

        if (this.loadingView && Obj.deepEqual(this.loadingView.param, loaderParam)) {
            this.nextView = null;
            return;
        }

        if (this.currentView && Obj.deepEqual(this.currentView.param, loaderParam)) {
            if (this.loadingView) {
                this.disposeView(this.loadingView);
                this.loadingView = null;
                this.nextView = null;    
            }
            this.updateViewStyle();
            return;
        }

        // Create a new loader from the most recent available
        const newLoader = new ImageLoader(loaderParam);

        newLoader.insertImg = this.insertImg;

        // Discard loading view if it's not relevant
        let styleUpdateRequired = false;
        if (this.loadingView) {
            if (!this.loadingView.samePath(newLoader)) {
                this.disposeView(this.loadingView);
                this.loadingView = null;
                this.nextView = null;
                styleUpdateRequired = true;
            }
        }

        if (this.loadingView) {
            // Enqueue the current view
            this.nextView = newLoader;
        } else {
            // Try to start from 
            this.loadingView = newLoader;
            this.startLoadingView();
            styleUpdateRequired = true;
        }

        if (styleUpdateRequired) {
            this.updateViewStyle();
        }
    }

    private viewSized =(err:any)=> {
        if (!this.loadingView!.details) {
            // Activate the view directly
            this.loadingView!.events.removeListener('rendered', this.viewRendered);
            this.viewRendered();
            return;
        }

        if (this.currentView && !this.loadingView!.sameGeometry(this.currentView)) {
            this.disposeView(this.currentView);
            this.currentView = null;
            this.bestFit();
        } else {
            // Now it needs an expose at the right size...
            if (!this.currentView || !this.currentView.details) {
                this.bestFit();
            } else {
                this.setCurrentImagePos(this.currentImagePos);
            }
        }
    }

    private viewRendered=()=>{
        if (this.currentView) {
            this.disposeView(this.currentView);
            this.currentView = null;
        }
        this.currentView = this.loadingView;
        this.loadingView = this.nextView;
        this.nextView = null;
        if (this.loadingView) {
            this.startLoadingView();
        }
        this.updateViewStyle();
    }

    private disposeView(v:ImageLoader) {
        v.events.removeListener('statusChanged', this.updateViewStyle);
        v.events.removeListener('sized', this.viewSized);
        v.events.removeListener('rendered', this.viewRendered);
        v.dispose();        
    }

    // Start this.loadingView
    private startLoadingView() {
        this.loadingView!.events.on('statusChanged', this.updateViewStyle);
        this.loadingView!.events.once('sized', this.viewSized);
        this.loadingView!.events.once('rendered', this.viewRendered);
        this.loadingView!.prepare(this.currentView || undefined);
    }

    public flushView()
    {
        // WTF ?
        console.log('Flush view still called somewhere ? purpose ?');
        // if (this.loadingImg !== null && this.nextLoadingImgSrc !== null) {
        //     this.setSrc(this.loadingImgPath!, this.loadingImgSerial, this.nextLoadingImgSrc, this.nextLoadingImgWindow);
        // }
    }

    public currentImageSize():ImageSize|undefined {
        // FIXME: this function may lie, during an image loading...
        if (this.loadingView) {
            return this.loadingView.details || undefined;
        }
        return this.currentView?.details || undefined;
    }

    private insertImg=(img: HTMLElement)=>{
        if (this.crosshairInstance) {
            const elements = this.crosshairInstance.getElements();
            // Find the first child
            const childrens = this.child.children().filter(function(e) {
                return elements.index(this) > -1;
            });
            $(img).insertBefore(childrens.get(0));
        } else {
            this.child.append(img);
        }
    }

    closeMenu=()=>{
        this.closeContextMenuCb();
    }

    readonly getImagePosFromParent=(x:number, y:number):{imageX:number, imageY:number}|null=>
    {       
        const view = this.viewForGeometry();

        logger.debug('Translate', {x ,y, currentImagePos: this.currentImagePos, currentImageSize: view?.details});
        
        if (!view) {
            return null;
        }
        if (this.currentImagePos.w <= 0 || (this.currentImagePos.h <= 0)) {
            return null;
        }

        return {
            imageX: (x - this.currentImagePos.x) * view.details!.width / this.currentImagePos.w,
            imageY: (y - this.currentImagePos.y) * view.details!.height / this.currentImagePos.h,
        }
    }

    public readonly zoom=(cx:number, cy:number, z:number)=>{
        var corners = [
            [this.currentImagePos.x, this.currentImagePos.y],
            [this.currentImagePos.x + this.currentImagePos.w, this.currentImagePos.y + this.currentImagePos.h]
        ];

        var newCorners = [[0,0],[0,0]];
        var center = [cx, cy];
        for(var pt = 0; pt < corners.length; ++pt) {
            for(var i = 0; i < 2; ++i) {
                newCorners[pt][i] = center[i] + (corners[pt][i] - center[i]) * z;
            }
        }
        var newPos = {
            x: newCorners[0][0],
            y: newCorners[0][1],
            w: newCorners[1][0] - newCorners[0][0],
            h: newCorners[1][1] - newCorners[0][1]
        };
        //window.alert('setting newpos:' + JSON.stringify(newPos));
        this.setCurrentImagePos(newPos);
    }

    private dispatchNewPos(pos: ImagePos, size: ImageSize) {
        this.posUpdatedCb(pos, size);
    }

    private viewForGeometry() {
        if (this.currentView && this.currentView.details) {
            return this.currentView;
        }
        if (this.loadingView && this.loadingView.details) {
            return this.loadingView;
        }

        return undefined;
    }

    private setRawCurrentImagePos(e:CompleteImagePos, displaySize: ImageSize) {
        this.currentImagePos = e;

        if (this.currentView) {
            this.currentView.expose({
                displaySize,
                imagePos: e,
            });
        }

        if (this.loadingView) {
            this.loadingView.expose({
                displaySize,
                imagePos: e,
            });
        }

        const referenceView = this.viewForGeometry();
        if (referenceView) {
            this.dispatchNewPos(e, referenceView.details!);
        }
    }

    setCurrentImagePos(imgPos:ImagePos) {
        const referenceView = this.viewForGeometry();
        const viewSize = { x: this.child.width()!, y: this.child.height()!};
        let targetPos: CompleteImagePos;

        if (!referenceView) {
            targetPos = this.getBestFitForSize({width: 1, height: 1});
        } else {

            // prevent zoom under 1.
            if (imgPos.w < viewSize.x && imgPos.h < viewSize.y) {
                targetPos = this.getBestFitForSize(referenceView.details!);
            } else {
                // Prevent black borders
                targetPos = {...imgPos,
                    centerx: (viewSize.x / 2 - imgPos.x) / imgPos.w,
                    centery: (viewSize.y / 2 - imgPos.y) / imgPos.h,
                    zoomToBestfit: Math.max(imgPos.w/viewSize.x, imgPos.h/viewSize.y)
                };
                const marginX = (targetPos.w < viewSize.x) ? (viewSize.x - targetPos.w) / 2 : 0;
                const minx = marginX;
                const maxx = viewSize.x - marginX;


                const marginY = (targetPos.h < viewSize.y) ? (viewSize.y - targetPos.h) / 2 : 0;
                const miny = marginY;
                const maxy = viewSize.y - marginY;

                if (targetPos.x > minx) {
                    targetPos.x = minx;
                }
                if (targetPos.y > miny) {
                    targetPos.y = miny;
                }
                if (targetPos.x + targetPos.w < maxx) {
                    targetPos.x = maxx - targetPos.w;
                }
                if (targetPos.y + targetPos.h < maxy) {
                    targetPos.y = maxy - targetPos.h;
                }
            }
        }
    
        this.setRawCurrentImagePos(targetPos, {width: viewSize.x, height: viewSize.y});
        this.updateCrossHairPosition();
    }

    getBestFit():CompleteImagePos {
        const referenceView = this.viewForGeometry();
        
        return {
            ...this.getBestFitForSize(referenceView?.details || {width: 0, height: 0})
        };
    }

    getBestFitForSize(imageSize:ImageSize) {
        var viewSize = { width: this.child.width()!, height: this.child.height()!};
        return getBestFitForSize(imageSize, viewSize);
    }

    // Max zoom keeping aspect ratio
    bestFit() {
        // Move the img
        this.setCurrentImagePos(this.getBestFit());
    }
}

let uid:number = 0;

export type Props = {
    path: string|null;
    streamId: string|null;
    streamSerial: string|null;
    subframe?: Window|null;
    streamSize: ImageSize|null;
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
    private pos?: ImagePos;
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

    updatePos=(pos?: ImagePos, size?: ImageSize)=>{
        this.pos = pos;
        this.size = size;
        this.doSetPosition();
    }
}

export type FitsViewerContext = {
    declareChild:(e:React.RefObject<HTMLDivElement>)=>MarkerToken|undefined;
};

class FitsViewer extends React.PureComponent<Props, State> {
    uid:number;
    ImageDisplay: JQImageDisplay;
    $el: JQuery<HTMLDivElement>;
    el: React.RefObject<HTMLDivElement> = React.createRef();
    private readonly instanceContext: FitsViewerContext;

    constructor(props: Props) {
        super(props);
        this.uid = uid++;
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
        this.ImageDisplay.setFullState(this.props.path, this.props.streamId, this.props.streamSerial, this.props.subframe||null, this.props.directPort, this.getViewSettingsCopy(), this.props.streamSize || undefined);
    }

    componentDidMount() {
        this.$el = $(this.el.current!);
        this.ImageDisplay = new JQImageDisplay(this.$el,
            this.openContextMenu.bind(this),
            this.closeContextMenu.bind(this),
            this.onViewMoved);
        this.ImageDisplay.setFullState(this.props.path, this.props.streamId, this.props.streamSerial, this.props.subframe||null, this.props.directPort, this.getViewSettingsCopy(), this.props.streamSize || undefined);
    }

    private markers: {[uid:string]: MarkerToken} = {};
    private markerUid:number = 0;
    private lastPos?: ImagePos;
    private lastSize?: ImageSize;

    onViewMoved=(pos: ImagePos, size: ImageSize)=>{
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
        if (this.ImageDisplay) {
            this.ImageDisplay.dispose();
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
        if (this.ImageDisplay !== undefined) {
            this.ImageDisplay.flushView();
        }
    }

    xlateCoords=(x:number, y:number)=> {
        if (this.ImageDisplay !== undefined) {
            return this.ImageDisplay.getImagePosFromParent(x, y);
        }
        return null;
    }

    onResize = () => {
        if (this.ImageDisplay !== undefined) {
            this.ImageDisplay.onResize();
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