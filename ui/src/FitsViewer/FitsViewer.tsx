
import React, { Component, PureComponent} from 'react';
import $ from 'jquery';
import * as Obj from '../shared/Obj';
import './FitsViewer.css'
import ContextMenu from './ContextMenu';
import LevelBar from './LevelBar';
import FWHMDisplayer from './FWHMDisplayer';
import BaseApp from 'src/BaseApp';
import ContextMenuCross from './ContextMenuCross';
import ReactResizeDetector from 'react-resize-detector';

export type LevelId = "low"|"medium"|"high";

type ImageSize = {
    width: number;
    height: number;
}

export type Levels = {
    low: number;
    medium: number;
    high: number;
}

export type FullState = {
    levels: Levels;
}

type ImagePos = {
    x:number;
    y:number;
    w:number;
    h:number;
}

type CompleteImagePos = ImagePos & {
    centerx: number;
    centery: number;
    zoomToBestfit: number;
};

export type ContextMenuEntry = {
    title: string;
    key: string;
    cb: (e:ContextMenuEvent)=>(void);
    positional: boolean;
}

export type ContextMenuEvent = {
    x: number;
    y: number;
    imageX?: number;
    imageY?: number;
}

class JQImageDisplay {

    currentImg: HTMLImageElement|null = null;
    // The path (without cgi settings)
    currentImgPath: string|null = null;
    // Same with cgi settings ?
    currentImgSrc: string|null = null;

    currentDetails:ImageSize|null = null;
    currentDetailsPath: string|null = null;

    loadingDetailsAjax:JQueryXHR|null = null;
    loadingDetailsPath:string|null = null;

    loadingImg:HTMLImageElement|null = null;

    // The path (without cgi settings)
    loadingImgSrc:string|null = null;
    loadingImgPath:string|null = null;
    loadingToDisplay?:boolean = false;
    nextLoadingImgSrc:string|null = null;
    
    child:JQuery<HTMLDivElement>;
    
    levels: Levels;

    mouseIsDown:boolean = false;
    mouseDragged:boolean = false;
    mouseDragPos?:{x:number, y:number} = undefined;

    touches = {};

    currentImageSize:ImageSize = {width: -1, height: -1};
    currentImagePos:CompleteImagePos = {x:0, y:0, w:0, h:0, centerx: 0.5, centery: 0.5, zoomToBestfit: 1};

    menuTimer:NodeJS.Timeout|null = null;

    closeContextMenuCb:()=>void;
    onViewSettingsChangeCb:(state:FullState)=>void;
    contextMenuCb:(x:number, y:number)=>void;

    constructor(elt:JQuery<HTMLDivElement>, contextMenuCb:(x:number, y:number)=>void, closeContextMenuCb:()=>void, onViewSettingsChangeCb:(state:FullState)=>void) {
        
        this.child = elt;
        this.contextMenuCb = contextMenuCb;
        this.closeContextMenuCb = closeContextMenuCb;
        this.onViewSettingsChangeCb = onViewSettingsChangeCb;
        elt.css('display', 'block');
        elt.css('width', '100%');
        elt.css('height', '100%');
        elt.css('overflow', 'hidden');

        // const jqBindedEvents = ['click', 'wheel','mousedown', 'mouseup', 'mousemove', 'mouseleave', 'dragstart', 'touchmove', 
        // 'touchstart', 'touchend', 'touchcancel', 'touchleave', 'contextmenu' ];
        elt.on('click', this.click);
        elt.on('wheel', this.wheel);
        elt.on('mousedown', this.mousedown);
        elt.on('mouseup', this.mouseup);
        elt.on('mousemove', this.mousemove);
        elt.on('mouseleave', this.mouseleave);
        elt.on('dragstart', this.dragstart);
        elt.on('touchmove', this.touchmove);
        elt.on('touchstart', this.touchstart);
        elt.on('touchend', this.touchend);
        elt.on('touchcancel', this.touchcancel);
        elt.on('touchleave', this.touchleave);
        elt.on('contextmenu', this.contextmenu);

        this.levels = {
            low: 0.05,
            medium: 0.5,
            high: 0.95
        };
    }

    onResize = ()=>{
        const newSize = {x: this.child.width(), y:this.child.height() };
        if (newSize.x === undefined) return;
        if (newSize.y === undefined) return;

        if (this.currentImageSize.width === -1) return;
        if (this.currentImageSize.height === -1) return;

        const centerX = this.currentImageSize.width * this.currentImagePos.x;
        const centerY = this.currentImageSize.height * this.currentImagePos.y;
        const bestFit = this.getBestFit();

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

    cancelMenuTimer() {
        if (this.menuTimer !== null) {
            clearTimeout(this.menuTimer);
            this.menuTimer =  null;
        }
    }


    dispose() {
        this.cancelMenuTimer();
        this.child.off('click', this.click);
        this.child.off('wheel', this.wheel);
        this.child.off('mousedown', this.mousedown);
        this.child.off('mouseup', this.mouseup);
        this.child.off('mousemove', this.mousemove);
        this.child.off('mouseleave', this.mouseleave);
        this.child.off('dragstart', this.dragstart);
        this.child.off('touchmove', this.touchmove);
        this.child.off('touchstart', this.touchstart);
        this.child.off('touchend', this.touchend);
        this.child.off('touchcancel', this.touchcancel);
        this.child.off('touchleave', this.touchleave);
        this.child.off('contextmenu', this.contextmenu);
        this.child.empty();
    }

    abortDetailsLoading()
    {
        if (this.loadingDetailsAjax !== null) {
            var toCancel = this.loadingDetailsAjax;
            this.loadingDetailsAjax = null;
            this.loadingDetailsPath = null;
            toCancel.abort();
            this.child.removeClass('PreLoading');
        }
    }


    abortLoading() {
        if (this.loadingImg !== null) {
            this.loadingImg.src = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEAAAAALAAAAAABAAEAAAI=;';
            if (this.loadingToDisplay) {
                this.loadingImg.parentNode!.removeChild(this.loadingImg);
                this.loadingToDisplay = false;
            }
            this.loadingImg = null;
            this.loadingImgPath = null;
            this.loadingImgSrc = null;
            this.nextLoadingImgSrc = null;
            this.child.removeClass('Loading');
        }
    }
    
    getFullState(): FullState
    {
        return {
            levels: {...this.levels}
        }
    }

    changeLevels(f:(l:Levels)=>(boolean))
    {
        if (!f(this.levels)) {
            return false;
        }
        this.emitStateChange();
        return true;
    }

    computeSrc(path:string|null, optionalImageSize?:ImageSize)
    {
        const imageSize = optionalImageSize || this.currentImageSize;
        let str;
        if (path !== null) {
            if (path === undefined ){
                throw new Error("Undefined path arrived");
            }
            var bin = 16;
            if (this.currentImagePos.w > 0 && this.currentImagePos.h > 0
                 && imageSize.width  > -1 && imageSize.height > -1)
            {
                bin = Math.floor(Math.min(
                    imageSize.width / this.currentImagePos.w,
                    imageSize.height / this.currentImagePos.h
                ));
            } else if (imageSize.width > 0 && imageSize.height > 0) {
                // Prepare for a best fit
                const bestFit = this.getBestFitForSize(imageSize);
                bin = Math.floor(Math.min(
                    imageSize.width / bestFit.w,
                    imageSize.height / bestFit.h
                ));
            }

            // lower this to a 2^power
            bin = Math.floor(Math.log2(bin));
            if (bin < 0) {
                bin = 0;
            }

            str = 'fitsviewer/fitsviewer.cgi?bin=' + bin + '&path=' + encodeURIComponent(path);
            str += '&low=' + this.levels.low;
            str += '&med=' + this.levels.medium;
            str += '&high=' + this.levels.high;
        } else {
            str = "#blank";
        }
        return str;
    }

    emitStateChange()
    {
        this.onViewSettingsChangeCb(this.getFullState());
    }

    setFullState(path:string|null, params?:FullState) {
        if (params !== undefined && 'levels' in params) {
            this.levels = params.levels;
        }
        // FIXME: c'est ici qu'il faut continuer:
        // il faut assurer qu'on charge la taille avant, que computeurl dépende de la taille
        // et implementer le downsampling coté serveur
        // et revoir le témoin de chargement
        if (this.loadingImg !== null && this.loadingImgPath === path) {
            const newSrc = this.computeSrc(path);
            if (this.loadingImgSrc === newSrc) {
                // Already loading... Just wait...
                this.nextLoadingImgSrc = null;
            } else {
                // Enqueue the loading
                this.nextLoadingImgSrc = newSrc;
            }
        } else {
            this.nextLoadingImgSrc = null;
            if (this.currentImgPath !== path) {
                if (!this.setDetails(path)) {
                    // Stop loading for previous path
                    this.abortLoading();
                } else {
                    // Ready for new url. go
                    const newSrc = this.computeSrc(path);
                    this.setSrc(path, newSrc);
                }
            } else {
                // Ready for new url. go
                // Don't go back...
                this.abortDetailsLoading();
                const newSrc = this.computeSrc(path);
                this.setSrc(path, newSrc);
            }
        }
    }

    // True if ready, false otherwise
    setDetails(path:string|null)
    {
        if (this.currentDetailsPath === path) {
            this.abortDetailsLoading();
            return true;
        }

        if ((this.loadingDetailsAjax !== null) && this.loadingDetailsPath === path) {
            return false;
        }

        this.abortDetailsLoading();

        // Start an ajax load of the new path
        this.loadingDetailsPath = path;
        this.child.addClass('PreLoading');
        if (path === null) {
            this.gotDetails(path, null);
            return true;
        } else {
            this.loadingDetailsAjax = $.ajax({
                url: 'fitsviewer/fitsviewer.cgi?size=true&path=' + encodeURIComponent(path),
                dataType: 'json',
                error: (e)=>{
                    console.log('size query had error', e);
                    this.gotDetails(path, null);
                },
                success: (d)=> {
                    console.log('Size is ', d);
                    this.gotDetails(path, d);
                },
                timeout: 30000
            });
        }
        return false;
    }

    gotDetails(path:string|null, rslt:ImageSize|null)
    {
        // FIXME: ajax request can be reordered (right path with the wrong request, is it important ?)
        if (path !== this.loadingDetailsPath) {
            console.log('Ignore late size result');
            return;
        }
        this.currentDetailsPath = this.loadingDetailsPath;
        this.currentDetails = rslt;
        this.loadingDetailsPath = null;
        this.loadingDetailsAjax = null;
        this.child.removeClass('PreLoading');
        if (rslt !== null) {
            this.setSrc(this.currentDetailsPath, this.computeSrc(this.currentDetailsPath, rslt));
        } else {
            this.setSrc(this.currentDetailsPath, "#blank");
        }
    }

    flushView()
    {
        if (this.loadingImg !== null && this.nextLoadingImgSrc !== null) {
            this.setSrc(this.loadingImgPath!, this.nextLoadingImgSrc);
        }
    }

    
    setSrc(path:string|null, src: string) {
        if (this.currentImgSrc === src) {
            this.abortLoading();
            this.currentImgPath = path;
            return;
        }
        if ((this.loadingImg !== null) && (this.loadingImgSrc === src)) {
            return;
        }

        this.abortLoading();

        const newImage = new Image();
        newImage.onload = (() => { console.warn('image loaded ok'); this.loaded(src, newImage, true) });
        newImage.onerror = ((e) => { console.warn('image loading failed', e); this.loaded(src, newImage, false) });
        newImage.src = src;
        $(newImage).css('display', 'block');
        $(newImage).css('pointer-events', 'none');
        console.log('Loading image: ' + src);
        this.loadingImg = newImage;
        this.loadingImgSrc = src;
        this.loadingImgPath = path;

        // Do exposed loading if possible (display image while it is loading)
        // FIXME: only for image of the same geo ?
        // FIXME: some browser  flickers to black. whitelist browser ?
        if (this.currentImg !== null && this.currentImgPath === this.loadingImgPath) {
            this.loadingToDisplay = true;
            $(this.loadingImg).css('position', 'absolute');
            $(this.loadingImg).css("width", $(this.currentImg).css("width"));
            $(this.loadingImg).css("height", $(this.currentImg).css("height"));
            $(this.loadingImg).css('top', $(this.currentImg).css("top"));
            $(this.loadingImg).css('left', $(this.currentImg).css("left"));
            this.child.append(this.loadingImg);
        } else {
            this.loadingToDisplay = false;
        }

        this.child.addClass('Loading');
        this.child.removeClass('Error');
    }

    loaded(newSrc:string, newImage:HTMLImageElement, result: boolean) {
        if (newImage !== this.loadingImg) {
            console.log('ignoring loaded for old image: ', newImage, this.loadingImg);
            return;
        }

        this.child.removeClass('Loading');
        if (result) {
            this.child.addClass('Success');
        } else {
            this.child.addClass('Error');
        }

        var previousSize = this.currentImageSize;

        var previousImg = this.currentImg;
        var previousImgSrc = this.currentImgSrc;

        this.loadingImg = null;
        this.currentImg = result ? newImage : null;
        this.currentImgSrc = newSrc;
        this.currentImgPath = this.loadingImgPath;
        this.child.empty();

        if (this.currentImg !== null) {
            this.currentImageSize = this.currentDetails!;
            
            $(this.currentImg).css('position', 'relative');

            this.child.append(this.currentImg);

            if (previousImg === null || previousSize.width != this.currentImageSize.width || previousSize.height != this.currentImageSize.height) {
                this.bestFit();
            } else {
                $(this.currentImg).css('top', $(previousImg).css('top'));
                $(this.currentImg).css('left', $(previousImg).css('left'));
                $(this.currentImg).css('width', $(previousImg).css('width'));
                $(this.currentImg).css('height', $(previousImg).css('height'));
            }
        }

        if (this.nextLoadingImgSrc !== null) {
            var todo = this.nextLoadingImgSrc;
            this.nextLoadingImgSrc = null;
            this.setSrc(this.currentImgPath, todo);
        }
    }

    closeMenu() {
        this.closeContextMenuCb();
    }

    private readonly touchstart=(e:JQuery.TouchStartEvent<HTMLDivElement>)=>{
        e.preventDefault();
        var touches = e.originalEvent!.changedTouches;
        for (var i=0; i<touches.length; i++) {
            var uid = "t:" + touches[i].identifier;
            this.touches[uid] = {
                x: touches[i].pageX,
                y: touches[i].pageY
            }
        }

        // Start a timer
        this.cancelMenuTimer();
        var activeTouches = Object.keys(this.touches);
        if (activeTouches.length == 1) {
            var where = this.touches[activeTouches[0]];
            where = {x: where.x, y: where.y};
            this.menuTimer = setTimeout(()=> {
                this.contextMenuAt(where.x, where.y);
            }, 400);
        } else {
            this.closeMenu();
        }
    }

    private readonly touchend=(e:JQuery.TouchEventBase<HTMLDivElement>)=>{
        e.preventDefault();
        this.cancelMenuTimer();
        var touches = e.originalEvent!.changedTouches;
        for (var i = 0; i < touches.length; i++) {
            var uid = "t:" + touches[i].identifier;
            delete this.touches[uid];
        }
    }

    private readonly touchcancel=(e:JQuery.TouchCancelEvent<HTMLDivElement>)=>{
        this.touchend(e);
    }

    private readonly touchleave=(e:JQuery.TriggeredEvent<HTMLDivElement>)=>{
        e.preventDefault();
        // Forget all current touches
        this.touches = {};
    }

    private readonly touchmove=(e:JQuery.TouchMoveEvent<HTMLDivElement>)=>{
        e.preventDefault();
        this.cancelMenuTimer();
        var touches = e.originalEvent!.changedTouches;
        var newTouches = {};
        for (var i = 0; i<touches.length; i++) {
            var uid = "t:" + touches[i].identifier;
            if (Object.prototype.hasOwnProperty.call(this.touches, uid)) {
                newTouches[uid] = {
                    x: touches[i].pageX,
                    y: touches[i].pageY
                }
            }
        }

        var activeTouches = Object.keys(this.touches);
        if (activeTouches.length === 2) {

            var self = this;
            const getPosAndDist = function() {
                var cx = 0, cy = 0, dx = 0, dy = 0;
                for(var i = 0; i < activeTouches.length; ++i) {
                    var uid = activeTouches[i];
                    cx += self.touches[uid].x;
                    cy += self.touches[uid].y;
                    dx += self.touches[uid].x * (i > 0 ? -1 : 1);
                    dy += self.touches[uid].y * (i > 0 ? -1 : 1);
                }

                return {
                    x: cx / 2,
                    y: cy / 2,
                    d: Math.sqrt(dx*dx + dy*dy)
                }
            }

            var before = getPosAndDist();
            Object.assign(this.touches, newTouches);
            var after = getPosAndDist();

            var offset = this.child.offset()!;

            if (before.d > 1 && after.d > 1) {
                var cx = (after.x + before.x) / 2;
                var cy = (after.y + before.y) / 2;

                this.zoom(cx - offset.left, cy - offset.top, after.d / before.d);
            }

            if (before.x != after.x || before.y != after.y) {
                var dx = after.x - before.x;
                var dy = after.y - before.y;
                /*this.setCurrentImagePos({
                    x: this.currentImagePos.x + dx,
                    y: this.currentImagePos.y + dy,
                    w: this.currentImagePos.w,
                    h: this.currentImagePos.h
                });*/
            }

        } else if (activeTouches.length == 1 && Object.prototype.hasOwnProperty.call(newTouches, activeTouches[0])) {
            var uid = activeTouches[0];
            var oldPos = this.touches[uid];
            var newPos = newTouches[uid];
            // It's a drag
            var dx = newPos.x - oldPos.x;
            var dy = newPos.y - oldPos.y;

            this.setCurrentImagePos({
                x: this.currentImagePos.x + dx,
                y: this.currentImagePos.y + dy,
                w: this.currentImagePos.w,
                h: this.currentImagePos.h
            });
            Object.assign(this.touches, newTouches);
        } else {
            Object.assign(this.touches, newTouches);
        }

    }


    private readonly dragstart=(e:JQuery.TriggeredEvent<HTMLDivElement>)=>{
        e.preventDefault();
    }

    private readonly mousedown=(e:JQuery.MouseDownEvent<HTMLDivElement>)=>{
        if (e.which == 1) {
            this.mouseIsDown = true;
            this.setMouseDragged(false);
            this.mouseDragPos = {x: e.originalEvent!.screenX, y: e.originalEvent!.screenY};
            this.closeMenu();
        }
    }

    private readonly mouseleave=(e:JQuery.MouseLeaveEvent<HTMLDivElement>)=>{
        this.mouseIsDown = false;
        this.setMouseDragged(false);
        this.mouseDragPos = undefined;
    }

    private readonly mousemove=(e:JQuery.MouseMoveEvent<HTMLDivElement>)=>{
        if (this.mouseIsDown) {
            this.setMouseDragged(true);

            var prevPos = this.mouseDragPos!;
            this.mouseDragPos = {x: e.originalEvent!.screenX, y: e.originalEvent!.screenY};


            this.setCurrentImagePos({
                x: this.currentImagePos.x + (this.mouseDragPos.x - prevPos.x),
                y: this.currentImagePos.y + (this.mouseDragPos.y - prevPos.y),
                w: this.currentImagePos.w,
                h: this.currentImagePos.h
            });
        }
    }

    private readonly mouseup=(e:JQuery.MouseUpEvent<HTMLDivElement>)=>{
        if (e.which == 1) {
            this.mouseIsDown = false;
            e.preventDefault()

            this.setMouseDragged(false);
        }
    }

    private readonly setMouseDragged=(to:boolean)=>{
        if (this.mouseDragged == to) return;
        this.mouseDragged = to;
        this.child.css('pointer', to ? 'hand' : 'inherit');
    }


    contextMenuAt(pageX:number, pageY:number)
    {
        var offset = this.child.offset()!;
        var x = pageX - offset.left;
        var y = pageY - offset.top;
        this.contextMenuCb(x, y);
    }

    private readonly contextmenu=(e:JQuery.ContextMenuEvent<HTMLDivElement>)=>{
        e.preventDefault();
        this.contextMenuAt(e.pageX, e.pageY);
    }

    private readonly click=(e:JQuery.ClickEvent<HTMLDivElement>)=>{
        e.preventDefault();
        // FIXME: prevent clic from drag from mouseup ?

    }

    private readonly wheel=(e:JQuery.TriggeredEvent<HTMLDivElement>)=>{
        const deltaY = (e.originalEvent! as any).deltaY;
        if (deltaY) {
            e.preventDefault();


            const offset = this.child.offset()!;
            const x = e.pageX! - offset.left;
            const y = e.pageY! - offset.top;

            let zoom = 0;
            // deltaX => ignore

            zoom = Math.sign(deltaY);

            zoom = Math.pow(2, -zoom / 8.0);

            this.zoom(x, y, zoom);
        }
    }

    readonly getImagePosFromParent=(x:number, y:number):{imageX:number, imageY:number}|null=>
    {
        console.log('Translate : ' ,x ,y, this.currentImagePos, this.currentImageSize);
        if ((this.currentImageSize.width <= 0) || (this.currentImageSize.height <= 0)) {
            return null;
        }
        if (this.currentImagePos.w <= 0 || (this.currentImagePos.h <= 0)) {
            return null;
        }

        return {
            imageX: (x - this.currentImagePos.x) * this.currentImageSize.width / this.currentImagePos.w,
            imageY: (y - this.currentImagePos.y) * this.currentImageSize.height / this.currentImagePos.h,
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


    private setRawCurrentImagePos(e:CompleteImagePos) {
        if (this.currentImg !== null) {
            $(this.currentImg).css("width", e.w + 'px');
            $(this.currentImg).css("height", e.h + 'px');
            $(this.currentImg).css('top', e.y + 'px');
            $(this.currentImg).css('left', e.x + 'px');

            if(this.loadingToDisplay) {
                $(this.loadingImg!).css("width", e.w + 'px');
                $(this.loadingImg!).css("height", e.h + 'px');
                $(this.loadingImg!).css('top', e.y + 'px');
                $(this.loadingImg!).css('left', e.x + 'px');
            }
        }
        this.currentImagePos = e;
    }

    setCurrentImagePos(imgPos:ImagePos) {
        let targetPos: CompleteImagePos;
        const viewSize = { x: this.child.width()!, y: this.child.height()!};
        // prevent zoom under 1.
        if (imgPos.w < viewSize.x && imgPos.h < viewSize.y) {
            targetPos = this.getBestFit();
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
        this.setRawCurrentImagePos(targetPos);

        // Adjust the bin
        if (this.loadingDetailsPath === null) {
            // No path change. Make sure the path is the latest
            let path;
            if (this.loadingImgPath !== null) {
                path = this.loadingImgPath;
            } else {
                path = this.currentImgPath;
            }
            const newSrc = this.computeSrc(path!);
            this.setSrc(path, newSrc);
        }
    }

    getBestFit():CompleteImagePos {
        return {
            ...this.getBestFitForSize(this.currentImageSize),
            centerx: 0.5,
            centery: 0.5,
            zoomToBestfit: 1.0,
        };
    }

    getBestFitForSize(imageSize:ImageSize) {
        var viewSize = { width: this.child.width()!, height: this.child.height()!};

        if (imageSize.width == 0
            || imageSize.height == 0
            || viewSize.width == 0
            || viewSize.height == 0)
        {
            // Don't bother
            return {x: 0, y:0, w: viewSize.width, h: viewSize.height};

        }
        // If image is larger than view
        // imageSize.x / imageSize.y > viewSize.x / viewSize.y
        // imageSize.x * viewSize.y > viewSize.x * imageSize.y
        else if (imageSize.width * viewSize.height > viewSize.width * imageSize.height) {
            // scale for width and adjust height
            var heightInClient = viewSize.width * imageSize.height / imageSize.width;
            return {x: 0, y:(viewSize.height - heightInClient) / 2, w: viewSize.width, h: heightInClient};
        } else {
            // Scale for height and adjust width
            var widthInClient = viewSize.height * imageSize.width / imageSize.height;
            return {x: ((viewSize.width - widthInClient) / 2), y:0, w: widthInClient, h: viewSize.height};
        }
    }

    // Max zoom keeping aspect ratio
    bestFit() {
        // Move the img
        this.setCurrentImagePos(this.getBestFit());
    }
}

let uid:number = 0;

export type Props = {
    src: string|null;
    viewSettings?: Partial<FullState>;
    contextMenu?: ContextMenuEntry[];
    onViewSettingsChange: (state: FullState)=>(void);
};

export type State = {
    contextmenu: {x:number, y:number}|null;
    histogramView: null|LevelId;
    fwhm: boolean;
};

class FitsViewer extends React.PureComponent<Props, State> {
    uid:number;
    ImageDisplay: JQImageDisplay;
    $el: JQuery<HTMLDivElement>;
    el: React.RefObject<HTMLDivElement> = React.createRef();

    constructor(props: Props) {
        super(props);
        this.uid = uid++;
        this.state = {
            contextmenu: null,
            histogramView: null,
            fwhm: false,
        };

        this.displaySetting = this.displaySetting.bind(this);
        this.updateHisto = this.updateHisto.bind(this);
    }

    componentDidUpdate(prevProps: Props) {
        this.ImageDisplay.setFullState(this.props.src, this.getViewSettingsCopy());
    }

    componentDidMount() {
        this.$el = $(this.el.current!);
        this.ImageDisplay = new JQImageDisplay(this.$el,
            this.openContextMenu.bind(this),
            this.closeContextMenu.bind(this),
            this.onViewSettingsChange.bind(this));
        this.ImageDisplay.setFullState(this.props.src, this.getViewSettingsCopy());
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

    private readonly displaySetting=(which: LevelId|"fwhm"|null)=>{
        if (which === 'fwhm') {
            this.setState({contextmenu: null, histogramView: null, fwhm: true});
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

    updateHisto(which: string, v:number) {
        var newViewSettings = this.getViewSettingsCopy();
        newViewSettings.levels[which] = v;
        
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

    render() {
        console.log('state is ', this.state);
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
            histogramView = <FWHMDisplayer src={this.props.src}/>
        } else {
            histogramView = null;
        }
        return(
            <div className='FitsViewOverlayContainer'>
                <div className='FitsView' ref={this.el}>
                    <ReactResizeDetector handleWidth handleHeight onResize={this.onResize} />
                </div>
                <div className='FitsViewLoading'/>
                <div className='FitsSettingsOverlay'>
                    {histogramView}
                </div>
                {visor}
                {contextMenu}
            </div>);
    }

}

export default FitsViewer;