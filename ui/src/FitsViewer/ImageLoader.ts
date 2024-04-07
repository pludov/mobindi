import Log from '../shared/Log';
import * as Obj from '../shared/Obj';
import './FitsViewer.css'
import { EventEmitter } from 'events';
import { getBestFitForSize, growToBinBoundary, intersect, pointMax, pointMin, rectInclude } from './ImageUtils';
import ImageInfoQuery from './ImageInfoQuery';
import { ImageDetails, ImageSize, Levels, Rectangle, SubFrame } from './Types';

const logger = Log.logger(__filename);

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
    window: SubFrame|null;

    // Bypass getting image size
    imageDetails: ImageDetails|undefined;
}

type ImageExposure = {
    // Target display area
    displaySize: ImageSize;
    // Actual portion of the image beeing displayed
    imagePos: Rectangle;
}

type TileStatus = {
    loading: boolean;
    error: boolean;
    rendered: boolean;
}

// Tile are rendered in image coordinate (1px dom = 1 pix in source)
class Tile {
    loader: ImageLoader;
    img: HTMLImageElement|null = null;
    
    // Base url for the content
    srcBase: string;

    bin: number;

    pos: Rectangle;

    status : TileStatus = { loading: false, error: false, rendered: false};

    // Set by loader, for purpose of ordering load
    dstToCenter: number = 0;

    constructor(loader: ImageLoader, src: string, bin: number, pos: Rectangle)
    {
        this.loader = loader;
        this.srcBase = src;
        this.bin = bin;
        this.pos = pos;
    }

    startLoading() {
        // load the content of the image
        this.img = new Image();
        this.img.src = this.srcBase + `&x0=${this.pos.x}&y0=${this.pos.y}&x1=${this.pos.x + this.pos.w - 1}&y1=${this.pos.y + this.pos.h - 1}`;
        this.img.addEventListener("load", this.imageElementLoaded);
        this.img.addEventListener("error", this.imageElementFailed);
        this.img.id = "image loader img";
        
        this.status.loading = true;
        this.status.rendered = false;
        this.status.error = false;
    }

    imageElementLoaded=()=> {
        logger.debug('imageloader => loading finished');
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

    reset() {
        if (this.img) {
            this.img.removeEventListener("load", this.imageElementLoaded);
            this.img.removeEventListener("error", this.imageElementFailed);
            this.img.src = imageReleaseUrl;
            this.img.parentNode?.removeChild(this.img);
            this.img = null;
        }
        this.status.loading = false;
        this.status.rendered = false;
        this.status.error = false;
    }

    // Abort loading
    // Drop from the tile set
    dispose() {
        this.reset();
    }
}

class TilePlane {
    tiles: Array<Tile>;
    bin: number;
    tileSize: number;
    nbTileX: number;
    nbTileY: number;
    details: ImageSize;
    baseSrc: string;

    constructor(imageLoader : ImageLoader, details: ImageSize, bin: number, baseSrc:string) {
        this.details = details;
        this.bin = bin;
        this.baseSrc = baseSrc;

        // Construct a full tile plane
        this.tileSize = 256 * (2 ** bin);
        this.nbTileX = Math.ceil(this.details!.width / this.tileSize);
        this.nbTileY = Math.ceil(this.details!.height / this.tileSize);

        this.tiles = [];
        for(let ty = 0; ty < this.nbTileY; ++ty)
            for(let tx = 0; tx < this.nbTileX; ++tx)
            {
                let x = tx * this.tileSize;
                let y = ty * this.tileSize;
                const x1 = Math.min(x + this.tileSize, this.details.width);
                const y1 = Math.min(y + this.tileSize, this.details.height);
                const tile = new Tile(imageLoader, baseSrc, bin, growToBinBoundary({
                        x, 
                        y,
                        w: x1 - x,
                        h: y1 - y,
                    }, bin));

                this.tiles[tx + ty * this.nbTileX] = tile;
            }
    }    

    // Stop any loading activity here
    abortLoading() {
        for(const tile of this.tiles) {
            if (tile.status.loading) {
                tile.reset();
            }
        }
    }

    dispose() {
        for(const tile of this.tiles) {
            tile.dispose();
        }
    }
}


type CanvasAsyncUpdateRequest = {full?: boolean, bin?:number, tiles?:Array<Tile>, idealBin?: number, immediate?:boolean};

/* Load a canvas element, scaled to the source image (1 CSS px = 1 adu)
 */
export class ImageLoader {
    param: ImageParameter;
    exposure: ImageExposure|undefined;

    // True when loading to display
    loadingToDisplay: boolean;

    // Will be set during loading
    details: ImageDetails | null;
    frameDetails: ImageDetails | null;

    detailsRequest: ImageInfoQuery|null = null;
    detailsLoaded: boolean = false;

    // Will emit : rendered (once current view is covered), statusChanged (during loading)
    events: EventEmitter = new EventEmitter();

    // Target img element
    targetPlane: TilePlane|undefined = undefined;
    // Tile planes by their tile value (0, 1, 2, 3...)
    tilePlanes: Array<TilePlane|undefined> = [];
    // Priority of tiles display (targetPlane is tilePlanes[tilePlaneOrder[0]])
    tilePlaneOrder: Array<number> = [];

    // Tiles to start loading
    pendingLoad: Array<Tile> = [];
    // Current number of tiles beeing loaded
    loadingCount: number = 0;

    root: HTMLSpanElement;

    disposed: boolean = false;

    // URL to fitsviewer.cgi
    cgiUrl: string;

    constructor(param: ImageParameter, cgiUrl: string) {
        this.param = param;
        this.cgiUrl = cgiUrl;
        this.root = document.createElement("span");
    }

    samePath(other: ImageLoader) {
        return this.param.path === other.param.path;
    }

    sameGeometry(other: ImageLoader) {
        if (!this.frameDetails) {
            return false;
        }
        if (!other.frameDetails) {
            return false;
        }

        return (this.frameDetails.width === other.frameDetails.width
                && this.frameDetails.height === other.frameDetails.height)
    }

    // Prepare a new rending. Take from previousLoader what can be taken
    // FIXME: what if previousLoader is visible ?
    prepare(previousLoader?: ImageLoader)
    {
        if (!this.param.imageDetails
            && previousLoader
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
        logger.debug('startDetailsRequest', this.param)
        if (this.param.imageDetails) {
            this.onDetailsLoaded(this.param.imageDetails);
        } else {
            this.detailsRequest = new ImageInfoQuery(this.encodePathUrl());
            this.detailsRequest.register(this, this.onDetailsLoaded);
            this.detailsRequest.start();
        }
    }

    abortDetailsRequest() {
        this.detailsRequest?.unregister(this);
        this.detailsRequest = null;
    }

    dispose()
    {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        this.abortDetailsRequest();
        this.abortCanvasAsyncUpdate();
        for(let bin = 0; bin < this.tilePlanes.length; ++bin) {
            const tilePlane = this.tilePlanes[bin];
            if (tilePlane) {
                tilePlane.dispose();
                this.tilePlanes[bin] = undefined;
            }
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

        bin = Math.min(
            imageSize.width / exposure.imagePos.w,
            imageSize.height / exposure.imagePos.h
        );

        if (window.devicePixelRatio) {
            bin /= window.devicePixelRatio;
        }
        const ratio = bin;

        // lower this to a 2^power. 0.8 is for filtering/speedup
        const idealBin = Math.log2(bin) + 0.8;
        // Take an integer bining
        bin = Math.floor(idealBin);

        // FIXME: color image doesn't support bin0
        if (bin < 0) {
            bin = 0;
        }

        let quality = bin == 0 ? 92 : 85;
        if (this.param.path.startsWith("stream:")) {
            // Streaming get lower quality for faster transfert
            quality -= 5;
        }

        console.log('ratio is ', ratio, quality);
        str = this.cgiUrl;
        str += '?bin=' + bin + '&' + this.encodePathUrl();
        str += '&low=' + this.param.levels.low;
        str += '&med=' + this.param.levels.medium;
        str += '&high=' + this.param.levels.high;
        str += '&quality=' + quality;
        if (this.param.serial !== null) {
            str += "&serial=" + encodeURIComponent(this.param.serial);
        }

        return {src: str, bin, idealBin};
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

    onDetailsLoaded = (details: ImageDetails|null)=>{
        this.detailsLoaded = true;
        this.detailsRequest = null;
        this.details = details;
        this.frameDetails = !details ? null : !this.param.window ? details :
            {
                ...details,
                width: this.param.window.maxW,
                height: this.param.window.maxH,
            };
        logger.debug('ImageLoader got details', details, this.frameDetails)
        this.events.emit('sized', details);
        if (details === null && !this.disposed) {
            this.events.emit('statusChanged');
        }
    }

    // Ensure a rendered is dispatched as soon as all visible tiles get loaded
    private waitingForRendered: boolean = false;

    expose = (exposure: ImageExposure)=> {
        // Change exposure for subframe
        if (this.param.window) {
            const newPos = {...exposure.imagePos};

            newPos.x += newPos.w * this.param.window.x / this.param.window.maxW;
            newPos.y += newPos.h * this.param.window.y / this.param.window.maxH;
            newPos.w = newPos.w * this.param.window.w / this.param.window.maxW
            newPos.h = newPos.h * this.param.window.h / this.param.window.maxH

            exposure = {
                ...exposure,
                imagePos: newPos
            }
        }

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
            // TODO : Remove any tile that is not covered by the actual exposure:
            //    totally out of exposure (with % margin )
            //    totally hidden by current already loaded tile
            
            const {bin, idealBin, src} = this.computeSrc();
            this.targetPlane = this.tilePlanes[bin];
            this.tilePlaneOrder = [bin];
            for(let i = bin - 1 ; i >= 0; --i)
                this.tilePlaneOrder.push(i);
            for(let i = bin + 1; i < this.tilePlanes.length; i++)
                this.tilePlaneOrder.push(i);
            
            // Abort any unrelated tile plane
            for(let i = 0; i < this.tilePlanes.length; ++i) {
                if (i !== bin) {
                    this.tilePlanes[i]?.abortLoading();
                }
            }

            if (!this.targetPlane) {
                this.targetPlane = new TilePlane(this, this.details!, bin, src);
                this.tilePlanes[bin] = this.targetPlane;
                this.events.emit('statusChanged');
            }
            
            this.waitingForRendered = true;
            this.controlTileLoading(src);
            this.refreshCanvas(bin, idealBin);
            this.queueCanvasAsyncUpdate({idealBin})
        }
    }

    display2Image(d: {x:number, y:number}) {
        // display                                               -> image 
        // this.exposure!.imagePos.x                             -> 0
        // this.exposure!.imagePos.x + this.exposure!.imagePos.w -> this.details!.width

        return {
            x: (d.x - this.exposure!.imagePos.x)*(this.details!.width) / this.exposure!.imagePos.w,
            y: (d.y - this.exposure!.imagePos.y)*(this.details!.height) / this.exposure!.imagePos.h,
        }
    }

    canvas: HTMLCanvasElement|undefined;
    canvasBin: number;
    canvasPos: Rectangle;

    // Async update of canvas (to group updates)
    canvasUpdateAnimationFrame: number|undefined;
    canvasUpdateTimeout: NodeJS.Timeout|undefined;
    canvasUpdateParams: CanvasAsyncUpdateRequest|undefined;

    invalidateCanvas() {
        this.abortCanvasAsyncUpdate();
        this.canvas?.parentNode?.removeChild(this.canvas);
        this.canvas = undefined;
        this.canvasBin = 0;
        this.canvasPos = {
            x: 0, y: 0,
            w: 0, h: 0,
        }
    }

    renderTile(tile: Tile, context?: CanvasRenderingContext2D|null) {
        if (tile.status.rendered) {
            if (context === undefined) {
                context = this.getCanvasContext();
            }

            const scale = 1/(2 ** this.canvasBin);    
            try {
                context?.drawImage(tile.img!, 
                    (tile.pos.x - this.canvasPos.x) * scale,
                    (tile.pos.y - this.canvasPos.y) * scale,
                    tile.pos.w * scale,
                    tile.pos.h * scale);
            } catch(e) {
                logger.warn("rendering image failed", e);
            }
        }
    }

    getCanvasContext() {
        const context = this.canvas?.getContext('2d');
        if (context) {
            context.imageSmoothingEnabled = false;
        }
        if (!context) {
            return null;
        }
        return context;
    }

    // Program an async update of the canvas
    refreshCanvas(bin:number, idealBin: number) {
        if (!this.details) {
            this.invalidateCanvas();
            return;
        }        

        // Keep the current canvas if it is ok and not invalidated
        if (!this.canvasUpdateParams?.full
            && this.canvasBin === bin
            && rectInclude(this.canvasPos, 
                    pointMax(
                        this.display2Image({x:0, y:0}),
                        {x: 0, y: 0}))
            && rectInclude(this.canvasPos,
                    pointMin(
                        this.display2Image(
                            {
                                x: this.exposure!.displaySize.width - 1,
                                y: this.exposure!.displaySize.height - 1
                            }),
                        {x: this.details!.width - 1, y : this.details!.height - 1})))
        {
            return;
        }

        this.queueCanvasAsyncUpdate({
            full: true,
            bin,
            idealBin,
        });
    }


    // Perform an async update of the canvas. always called from the context
    private asyncCanvasUpdate=()=>{
        const params = this.canvasUpdateParams!;
        this.canvasUpdateAnimationFrame = undefined;
        this.canvasUpdateTimeout = undefined;
        this.canvasUpdateParams = undefined;
        if (params.full) {
            this.invalidateCanvas();
    
            let topLeft = this.display2Image({
                x:-50,
                y:-50
            });
            let bottomRight = this.display2Image({
                x: 50 + this.exposure!.displaySize.width,
                y: 50 + this.exposure!.displaySize.height,
            })
            // Dont go beyond image
            if (topLeft.x < 0) topLeft.x = 0;
            if (topLeft.y < 0) topLeft.y = 0;
            if (bottomRight.x > this.details!.width) bottomRight.x = this.details!.width;
            if (bottomRight.y > this.details!.height) bottomRight.y = this.details!.height;
    
            this.canvasBin = params.bin!;
            this.canvasPos = growToBinBoundary({
                x: topLeft.x,
                y: topLeft.y,
                w: bottomRight.x - topLeft.x,
                h: bottomRight.y - topLeft.y,
            }, params.bin!);

            this.canvas = document.createElement('canvas');
            this.canvas.width = this.canvasPos.w;
            this.canvas.height = this.canvasPos.h;
            
            this.canvas.style.pointerEvents= 'none';
            this.canvas.style.boxSizing= 'border-box';
            this.canvas.style.border= '0px';
            this.canvas.style.position= 'absolute';
            this.canvas.style.left = (this.param.window?.x || 0) + this.canvasPos.x + 'px';
            this.canvas.style.top = (this.param.window?.y || 0) + this.canvasPos.y + 'px';
            this.canvas.style.transformOrigin = '0px 0px';
            this.canvas.style.transform = `scale(${2 ** this.canvasBin})`;
            
            const context = this.getCanvasContext();
    
            for(let i = this.tilePlaneOrder.length - 1; i >= 0; --i) {
                const bin = this.tilePlaneOrder[i];
                const plane = this.tilePlanes[bin];
                for(const tile of plane?.tiles || []) {
                    this.renderTile(tile, context);
                }
            }
            this.root.appendChild(this.canvas);
        }

        if (params.tiles) {
            const context = this.getCanvasContext();
    
            for(const tile of params.tiles) {
                this.renderTile(tile, context);
            }
        }

        if (params.idealBin !== undefined) {
            this.updateCanvasFiltering(params.idealBin);
        }
    }

    // Create a timeout + an animation frame request
    // This timeout is skipped if p.immediate
    queueCanvasAsyncUpdate(p: CanvasAsyncUpdateRequest)
    {
        if (!this.canvasUpdateParams) {
            this.canvasUpdateParams = p;
            if (!p.immediate) {
                this.canvasUpdateTimeout = setTimeout(()=> {
                    this.canvasUpdateTimeout = undefined;
                    this.canvasUpdateAnimationFrame = window.requestAnimationFrame(this.asyncCanvasUpdate);
                }, 50);
            } else {
                this.canvasUpdateAnimationFrame = window.requestAnimationFrame(this.asyncCanvasUpdate);
            }
        } else {
            if (p.immediate && !this.canvasUpdateParams.immediate)
            {
                this.canvasUpdateParams.immediate = true;
                // Hurry up !
                if (this.canvasUpdateTimeout) {
                    clearTimeout(this.canvasUpdateTimeout);
                    this.canvasUpdateTimeout = undefined;
                    this.canvasUpdateAnimationFrame = window.requestAnimationFrame(this.asyncCanvasUpdate);
                }
            }

            if (p.full) {
                this.canvasUpdateParams = p;
            } else if (p.tiles && !this.canvasUpdateParams!.full) {
                if (!this.canvasUpdateParams!.tiles) {
                    this.canvasUpdateParams!.tiles = [];
                }
                for(const tile of p.tiles) {
                    this.canvasUpdateParams!.tiles!.push(tile);
                }
            }
            if (p.idealBin !== undefined) {
                this.canvasUpdateParams!.idealBin = p.idealBin;
            }
        }
    }

    abortCanvasAsyncUpdate() {
        if (this.canvasUpdateParams) {
            if (this.canvasUpdateTimeout) {
                clearTimeout(this.canvasUpdateTimeout);
                this.canvasUpdateTimeout = undefined;
            }
            if (this.canvasUpdateAnimationFrame) {
                window.cancelAnimationFrame(this.canvasUpdateAnimationFrame);
                this.canvasUpdateAnimationFrame = undefined;
            }
            this.canvasUpdateParams = undefined;
        }
    }

    updateCanvasFiltering(idealBin: number) {
        if (!this.canvas) return;
        // TODO : disabled for now, no good effect on rendering so far
        this.canvas.style.imageRendering = /*idealBin > 0.3 ? 'unset' :*/ 'pixelated';
    }

    controlTileLoading(src: string) {
        // Start loading the visible tiles:
        // those that intersect with [0, 0, displaySize[
        const topLeft = this.display2Image({
            x:-50,
            y:-50
        });
        const bottomRight = this.display2Image({
            x: 50 + this.exposure!.displaySize.width,
            y: 50 + this.exposure!.displaySize.height,
        })
        // Display in image coordinate
        const imageVisibleRect = {
            ...topLeft,
            w: bottomRight.x - topLeft.x,
            h: bottomRight.y - topLeft.y,
        }

        const displayCenter = this.display2Image({
            x: this.exposure!.displaySize.width / 2,
            y: this.exposure!.displaySize.height / 2,            
        });

        this.pendingLoad = [];
        this.loadingCount = 0;
        
        for(const tile of this.targetPlane!.tiles) {
            if (tile.status.rendered) {
                continue;
            }
            if (tile.status.loading) {
                this.loadingCount++;
                continue;
            }
            const visible = intersect(tile.pos, imageVisibleRect);
            if (visible) {
                const tileCenterX = tile.pos.x + tile.pos.w / 2;
                const tileCenterY = tile.pos.y + tile.pos.h / 2;
                
                const tileDstX = Math.abs(tileCenterX - displayCenter.x );
                const tileDstY = Math.abs(tileCenterY - displayCenter.y );
    
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
        while (this.pendingLoad.length > 0 && this.loadingCount < 4) {
            const tile = this.pendingLoad[0];
            this.pendingLoad.splice(0, 1);
            this.loadingCount++;

            tile.startLoading();
        }

        if (this.loadingCount === 0 && this.waitingForRendered) {
            // Drop all unused planes
            for(let bin = 0; bin < this.tilePlanes.length; ++bin) {
                const tilePlane = this.tilePlanes[bin];
                if (tilePlane !== this.targetPlane && tilePlane) {
                    tilePlane.dispose();
                    this.tilePlanes[bin] = undefined;
                }
            }
            this.tilePlanes.splice(this.targetPlane!.bin + 1, this.tilePlanes.length);
            this.waitingForRendered = false;
            this.events.emit('rendered');
        }
    }

    updateStatus(tile: Tile) {
        if (!tile.status.loading) {
            this.loadingCount--;
            this.continueLoading();
            this.queueCanvasAsyncUpdate({tiles: [tile], immediate: this.loadingCount === 0});
        }
        
        // TODO : Only emit for real changes (no more loading, all rendered, ...)
        if (!this.disposed)
            this.events.emit('statusChanged');
    }

    abortLoading() {
        this.abortDetailsRequest();
        this.targetPlane?.abortLoading();
        this.waitingForRendered = false;
    }

    hadLoadingError() {
        if (this.detailsLoaded && !this.details) return true;
        if (!this.detailsLoaded) return false;
        if (this.targetPlane) {
            for(const tile of this.targetPlane.tiles) {
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

        if (this.targetPlane) {
            for(const tile of this.targetPlane.tiles) {
                if (tile.status.loading) {
                    return true;
                }
            }
        }

        return false;
    }
}
