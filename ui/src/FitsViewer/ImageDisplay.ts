import $ from 'jquery';
import Log from '../shared/Log';
import * as Obj from '../shared/Obj';
import MouseMoveListener from '../MouseMoveListener';
import Crosshair from './Crosshair';
import { getBestFitForSize } from './ImageUtils';
import { ImageLoader } from './ImageLoader';
import { FullState, ImageDetails, ImageSize, Levels, Rectangle, SubFrame } from './Types';

const logger = Log.logger(__filename);

type ImagePos = Rectangle;

type CompleteImagePos = ImagePos & {
    centerx: number;
    centery: number;
    zoomToBestfit: number;
};

// Display an image and handle navigation, transition, ...
export class ImageDisplay {

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
    root: HTMLSpanElement;

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

        this.root = document.createElement("span");
        this.child.get(0).appendChild(this.root);

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

        if (this.root.parentNode != null) {
            this.root.parentNode!.removeChild(this.root);
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

    private windowEquals(w1 : Rectangle|null, w2: Rectangle|null) {
        if ((w1 === null) != (w2 === null)) {
            return false;
        }
        if (w1 === null || w2 === null) {
            return true;
        }
        return (w1.x === w2.x)
            && (w1.y === w2.y)
            && (w1.w === w2.w)
            && (w1.h === w2.h);
    }

    private applyWindow(img: HTMLImageElement, window: Rectangle|null) {
        const jqimg = $(img);

        if (window !== null) {
            const h = jqimg.css("height");
            jqimg.css("padding-top", `calc( ${window.x} * ${h} )`);
            jqimg.css("padding-bottom", `calc( ${window.y} * ${h} )`);
            const w = jqimg.css("width");
            jqimg.css("padding-left", `calc( ${window.w} * ${w} )`);
            jqimg.css("padding-right", `calc( ${window.h} * ${w} )`);
        } else {
            jqimg.css("padding-top", "0");
            jqimg.css("padding-bottom", "0");
            jqimg.css("padding-left", "0");
            jqimg.css("padding-right", "0");
        }
    }

    // imageSize is expected only for streams
    setFullState(file: string|null, streamId:string|null, streamSerial: string|null, window: SubFrame|null, directPort: number, params?:FullState, imageDetails?: ImageDetails) {
        // Don't display stream until ready
        if (streamId !== null && !imageDetails) {
            streamId = null;
        }

        ImageDisplay.directPort = directPort;

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
            imageDetails
        };

        if (this.loadingView && Obj.deepEqual(this.loadingView.param, loaderParam)) {
            this.nextView = null;
            return;
        }

        if (this.currentView && Obj.deepEqual(this.currentView.param, loaderParam)) {
            this.abortLoadingView();
            this.updateViewStyle();
            return;
        }
        
        // Create a new loader from the most recent available
        const newLoader = new ImageLoader(loaderParam, this.getCgiUrl());
        this.root.appendChild(newLoader.root);
    

        // Discard loading view if it's not relevant
        let styleUpdateRequired = false;
        if (this.loadingView) {
            if (!this.loadingView.samePath(newLoader)) {
                this.abortLoadingView();
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

        // Prevent currentView from loading anymore data
        this.currentView?.abortLoading();
    }

    private abortLoadingView() {
        this.nextView = null;
            
        if (this.loadingView) {
            this.disposeView(this.loadingView);
            this.loadingView = null;
            
            this.currentView?.expose({
                displaySize: this.getDisplaySize(),
                imagePos: this.currentImagePos,
            });
        }
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
        return this.viewForGeometry()?.details || undefined;
    }

    closeMenu=()=>{
        this.closeContextMenuCb();
    }

    private getCgiUrl() {
        let cgiUrl;
        if (ImageDisplay.allowHttpFallback()) {
            cgiUrl = "http://" + document.location.hostname + ":" + ImageDisplay.directPort + (document.location.pathname.replace(/\/[^/]+/, '') || '/');
        } else {
            cgiUrl = "";
        }
        cgiUrl += 'fitsviewer/fitsviewer.cgi';
        return cgiUrl;
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

    private getDisplaySize() {
        return { width: this.child.width()!, height: this.child.height()! }
    }

    private setRawCurrentImagePos(e:CompleteImagePos, displaySize: ImageSize) {
        // Update the root transformation
        const referenceView = this.viewForGeometry();

        this.root.style.transformOrigin = "0 0";
        this.root.style.position = 'absolute';

        let transform;
        if (referenceView && referenceView!.details) {
            const scaleFactorX = e.w / referenceView.details!.width;
            const scaleFactorY = e.h / referenceView.details!.height;
            transform = `translate(${e.x}px, ${e.y}px) scale(${scaleFactorX})`;

            // TODO: apply window here - so window is not a parameter of image loader
        } else {
            transform = "";
        }

        this.root.style.transform = transform;
    
        this.currentImagePos = e;

        if (this.currentView && !this.loadingView) {
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

        if (referenceView) {
            this.dispatchNewPos(e, referenceView.details!);
        }
    }

    setCurrentImagePos(imgPos:ImagePos) {
        const referenceView = this.viewForGeometry();
        const viewSize = this.getDisplaySize();
        let targetPos: CompleteImagePos;

        if (!referenceView) {
            targetPos = this.getBestFitForSize({width: 1, height: 1});
        } else {

            // prevent zoom under 1.
            if (imgPos.w < viewSize.width && imgPos.h < viewSize.height) {
                targetPos = this.getBestFitForSize(referenceView.details!);
            } else {
                // Prevent black borders
                targetPos = {...imgPos,
                    centerx: (viewSize.width / 2 - imgPos.x) / imgPos.w,
                    centery: (viewSize.height / 2 - imgPos.y) / imgPos.h,
                    zoomToBestfit: Math.max(imgPos.w/viewSize.width, imgPos.h/viewSize.height)
                };
                const marginX = (targetPos.w < viewSize.width) ? (viewSize.width - targetPos.w) / 2 : 0;
                const minx = marginX;
                const maxx = viewSize.width - marginX;


                const marginY = (targetPos.h < viewSize.height) ? (viewSize.height - targetPos.h) / 2 : 0;
                const miny = marginY;
                const maxy = viewSize.height - marginY;

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
    
        this.setRawCurrentImagePos(targetPos, viewSize);
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
