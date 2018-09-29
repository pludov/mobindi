import React, { Component, PureComponent} from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import $ from 'jquery';
import Obj from './shared/Obj.js';
import './FitsViewer.css'

const jqBindedEvents = ['click', 'wheel','mousedown', 'mouseup', 'mousemove', 'mouseleave', 'dragstart', 'touchmove', 'touchstart', 'touchend', 'touchcancel', 'touchleave', 'contextmenu' ];

class ContextMenu extends PureComponent {
    constructor(props) {
        super(props);
        this.showLow = this.showLow.bind(this);
        this.showMedium = this.showMedium.bind(this);
        this.showHigh = this.showHigh.bind(this);
        this.showFwhm = this.showFwhm.bind(this);
    }

    showLow() { this.props.displaySetting('low'); }
    showMedium() { this.props.displaySetting('medium'); }
    showHigh() { this.props.displaySetting('high'); }
    showFwhm() { this.props.displaySetting('fwhm'); }

    render() {
        // FIXME: ensure that the menu does not go outside
        var css = {
            left: this.props.x,
            top: this.props.y,
            position: 'absolute'
        }
        console.log('x = ', this.props.x, 'y = ', this.props.y);
        return(
            <div className="ImageContextMenu" style={css}>
                <div className="Item" onClick={this.showLow}>Low level</div>
                <div className="Item" onClick={this.showMedium}>Median</div>
                <div className="Item" onClick={this.showHigh}>High level</div>
                <div className="Item" onClick={this.showFwhm}>FWHM</div>
            </div>);
    }
}

class LevelBar extends PureComponent {
    constructor(props) {
        super(props);
        this.sendUpdate = this.sendUpdate.bind(this);
        this.finishMove = this.finishMove.bind(this);
    }
    sendUpdate(v) {
        console.log('changing to ', v.target.valueAsNumber);
        this.props.onChange(this.props.property, v.target.valueAsNumber);
    }
    
    finishMove(v) {
        if (this.props.onFinishMove) {
            this.props.onFinishMove();
        }
    }

    render() {
        return (
            <div className="ImageBarSetting">
                <div className="ImageBarContainer">
                    <input type='range' min='0' max='1' step='any' value={this.props.value} onChange={this.sendUpdate} onMouseUp={this.finishMove}/>
                </div>
            </div>
        );
    }
/*
    top: 224.967px;
    position: absolute;
    width: 2em;
    border: 1px solid #606060;
    bottom: 0.2em;
    top: 0.2em;
    right: 0.2em;
    background: repeating-linear-gradient(-0deg, grey, transparent 0.5em, transparent 0.5em, grey 1em);
*/

}

class JQImageDisplay {



    constructor(elt, contextMenuCb, onViewSettingsChangeCb) {
        this.currentImg = undefined;
        // The path (without cgi settings)
        this.currentImgPath = undefined;

        this.currentDetails = undefined;
        this.currentDetailsPath = undefined;
        
        this.loadingDetailsAjax = undefined;
        this.loadingDetailsPath = undefined;

        this.loadingImg = undefined;
        // The path (without cgi settings)
        this.loadingImgSrc = undefined;
        this.loadingImgPath = undefined;
        this.loadingToDisplay = false;
        this.nextLoadingImgSrc = undefined;
        
        this.child = elt;
        this.contextMenuCb = contextMenuCb;
        this.onViewSettingsChangeCb = onViewSettingsChangeCb;
        elt.css('display', 'block');
        elt.css('width', '100%');
        elt.css('height', '100%');
        elt.css('overflow', 'hidden');

        for(var event of jqBindedEvents) {
            var func = event.replace(/-/,'');
            this[func] = this[func].bind(this);
            elt.on(event, this[func]);
        }


        this.mouseIsDown = false;
        this.mouseDragged = false;
        this.mouseDragPos = undefined;

        this.touches = {};

        this.currentImageSize = {width: -1, height: -1};
        this.currentImagePos = {x:0, y:0, w:0, h:0};

        // While the bestFit is active (cleared by moves)
        this.atBestFit = true;

        this.menuTimer = null;

        this.levels = {
            low: 0.05,
            medium: 0.5,
            high: 0.95
        };
    }

    cancelMenuTimer() {
        if (this.menuTimer !== null) {
            clearTimeout(this.menuTimer);
            this.menuTimer =  null;
        }
    }


    dispose() {
        this.cancelMenuTimer();
        for(var event of jqBindedEvents) {
            var func = event.replace(/-/,'');
            this.child.off(event, this[func]);
        }
        this.child.empty();
    }

    abortDetailsLoading()
    {
        if (this.loadingDetailsAjax != undefined) {
            var toCancel = this.loadingDetailsAjax;
            this.loadingDetailsAjax = undefined;
            this.loadingDetailsPath = undefined;
            toCancel.abort();
        }
    }


    abortLoading() {
        if (this.loadingImg != undefined) {
            this.loadingImg.src = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEAAAAALAAAAAABAAEAAAI=;';
            if (this.loadingToDisplay) {
                this.loadingImg.parentNode.removeChild(this.loadingImg);
                this.loadingToDisplay = false;
            }
            this.loadingImg = null;
            this.loadingImgPath = undefined;
            this.loadingImgSrc = undefined;
            this.nextLoadingImgSrc = undefined;
            this.child.removeClass('Loading');
        }
    }
    
    getFullState()
    {
        return {
            levels: Obj.deepCopy(this.levels)
        }
    }

    changeLevels(f)
    {
        if (!f(this.levels)) {
            return false;
        }
        this.emitStateChange();
    }

    computeSrc(path)
    {
        var str = "" + path;
        if (path) {
            var bin = 16;
            if (this.currentImagePos.w > 0 && this.currentImagePos.h > 0
                 && this.currentImageSize.width  > -1 && this.currentImageSize.height > -1)
            {
                bin = Math.floor(Math.min(
                            this.currentImageSize.width / this.currentImagePos.w,
                            this.currentImageSize.height / this.currentImagePos.h
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

    setFullState(path, params) {
        if (params !== undefined && 'levels' in params) {
            this.levels = params.levels;
        }
        // FIXME: c'est ici qu'il faut continuer:
        // il faut assurer qu'on charge la taille avant, que computeurl dépende de la taille
        // et implementer le downsampling coté serveur
        // et revoir le témoin de chargement
        if (this.loadingImg !== undefined && this.loadingImgPath == path) {
            var newSrc = this.computeSrc(path);
            if (this.loadingImgSrc == newSrc) {
                // Already loading... Just wait...
                this.nextLoadingImgSrc = undefined;
            } else {
                // Enqueue the loading
                this.nextLoadingImgSrc = newSrc;
            }
        } else {
            this.nextLoadingImgSrc = undefined;
            if (this.currentImgPath != path) {
                if (!this.setDetails(path)) {
                    // Stop loading for previous path
                    this.abortLoading();
                } else {
                    // Ready for new url. go
                    var newSrc = this.computeSrc(path);
                    this.setSrc(path, newSrc);
                }
            } else {
                // Ready for new url. go
                // Don't go back...
                this.abortDetailsLoading();
                var newSrc = this.computeSrc(path);
                this.setSrc(path, newSrc);
            }
        }
    }

    // True if ready, false otherwise
    setDetails(path)
    {
        var self = this;
        if (this.currentDetailsPath == path) {
            this.abortDetailsLoading();
            return true;
        }

        if ((this.loadingDetailsAjax !== undefined) && this.loadingDetailsPath == path) {
            return false;
        }

        this.abortDetailsLoading();

        // Start an ajax load of the new path
        this.loadingDetailsPath = path;
        this.loadingDetailsAjax = $.ajax({
            url: 'fitsviewer/fitsviewer.cgi?size=true&path=' + encodeURIComponent(path),
            dataType: 'json',
            error: function(e) {
                console.log('size query had error', e);
                self.gotDetails(path, null);
            },
            success: function(d) {
                console.log('Size is ', d);
                self.gotDetails(path, d);
            },
            timeout: 30000
        });

        return false;
    }

    gotDetails(path, rslt)
    {
        // FIXME: ajax request can be reordered (right path with the wrong request, is it important ?)
        if (path != this.loadingDetailsPath) {
            console.log('Ignore late size result');
            return;
        }
        this.currentDetailsPath = this.loadingDetailsPath;
        this.currentDetails = rslt;
        this.loadingDetailsPath = undefined;
        this.loadingDetailsAjax = undefined;
        if (rslt !== null) {
            this.setSrc(this.currentDetailsPath, this.computeSrc(this.currentDetailsPath));
        } else {
            this.setSrc(this.curentDetailsPath, "#blank");
        }
    }

    flushView()
    {
        if (this.loadingImg !== undefined && this.nextLoadingImgSrc !== undefined) {
            this.setSrc(this.loadingImgPath, this.nextLoadingImgSrc);
        }
    }

    
    setSrc(path, src) {
        var self = this;
        if (this.currentImgSrc == src) {
            this.abortLoading();
            return;
        }
        if ((this.loadingImg != undefined) && (this.loadingImgSrc == src)) {
            return;
        }

        this.abortLoading();

        var newImage = new Image();
        newImage.onload = (() => { console.warn('image loaded ok'); self.loaded(src, newImage, true) });
        newImage.onerror = ((e) => { console.warn('image loading failed', e); self.loaded(src, newImage, false) });
        newImage.src = src;
        console.log('Loading image: ' + src);
        this.loadingImg = newImage;
        this.loadingImgSrc = src;
        this.loadingImgPath = path;

        // Do exposed loading if possible (display image while it is loading)
        // FIXME: only for image of the same geo ?
        // FIXME: some browser  flickers to black. whitelist browser ?
        if (this.currentImg != undefined && this.currentImgPath == this.loadingImgPath) {
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

    loaded(newSrc, newImage, result) {
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

        this.loadingImg = undefined;
        this.currentImg = result ? newImage : undefined;
        this.currentImgSrc = newSrc;
        this.currentImgPath = this.loadingImgPath;
        this.child.empty();

        if (this.currentImg !== undefined) {
            this.currentImageSize = this.currentDetails;
            
            $(this.currentImg).css('position', 'relative');

            this.child.append(this.currentImg);

            if (previousImg == undefined || previousSize.width != this.currentImageSize.width || previousSize.height != this.currentImageSize.height) {
                this.bestFit();
            } else {
                $(this.currentImg).css('top', $(previousImg).css('top'));
                $(this.currentImg).css('left', $(previousImg).css('left'));
                $(this.currentImg).css('width', $(previousImg).css('width'));
                $(this.currentImg).css('height', $(previousImg).css('height'));
            }
        }

        if (this.nextLoadingImgSrc !== undefined) {
            var todo = this.nextLoadingImgSrc;
            this.nextLoadingImgSrc = undefined;
            this.setSrc(this.currentImgPath, todo);
        }
    }

    touchstart(e) {
        e.preventDefault();
        var touches = e.originalEvent.changedTouches;
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
            var self = this;
            this.menuTimer = setTimeout(function() {
                self.contextMenuAt(where.x, where.y);
            }, 400);
        }
    }

    touchend(e) {
        e.preventDefault();
        this.cancelMenuTimer();
        var touches = e.originalEvent.changedTouches;
        for (var i = 0; i < touches.length; i++) {
            var uid = "t:" + touches[i].identifier;
            delete this.touches[uid];
        }
    }

    touchcancel(e) {
        this.touchend(e);
    }

    touchleave(e) {
        e.preventDefault();
        // Forget all current touches
        this.touches = {};
    }

    touchmove(e) {
        e.preventDefault();
        this.cancelMenuTimer();
        var touches = e.originalEvent.changedTouches;
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
        if (activeTouches.length == 2) {

            var self = this;
            function getPosAndDist() {
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

            var offset = this.child.offset();

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


    dragstart(e) {
        e.preventDefault();
    }

    mousedown(e) {
        if (e.which == 1) {
            this.mouseIsDown = true;
            this.setMouseDragged(false);
            this.mouseDragPos = {x: e.originalEvent.screenX, y: e.originalEvent.screenY};
        }
    }

    mouseleave(e) {
        this.mouseIsDown = false;
        this.setMouseDragged(false);
        this.mouseDragPos = undefined;
    }

    mousemove(e) {
        if (this.mouseIsDown) {
            this.setMouseDragged(true);

            var prevPos = this.mouseDragPos;
            this.mouseDragPos = {x: e.originalEvent.screenX, y: e.originalEvent.screenY};


            this.setCurrentImagePos({
                x: this.currentImagePos.x + (this.mouseDragPos.x - prevPos.x),
                y: this.currentImagePos.y + (this.mouseDragPos.y - prevPos.y),
                w: this.currentImagePos.w,
                h: this.currentImagePos.h
            });
        }
    }

    mouseup(e) {
        if (e.which == 1) {
            this.mouseIsDown = false;
            e.preventDefault()

            this.setMouseDragged(false);
        }
    }

    setMouseDragged(to) {
        if (this.mouseDragged == to) return;
        this.mouseDragged = to;
        this.child.css('pointer', to ? 'hand' : 'inherit');
    }


    contextMenuAt(pageX, pageY)
    {
        var offset = this.child.offset();
        var x = pageX - offset.left;
        var y = pageY - offset.top;
        this.contextMenuCb(x, y);
    }

    contextmenu(e) {
        e.preventDefault();
        this.contextMenuAt(e.pageX, e.pageY);
    }

    click(e) {
        e.preventDefault();
        // FIXME: prevent clic from drag from mouseup ?

    }

    wheel(e) {
        if (e.originalEvent.deltaY) {
            e.preventDefault();


            var offset = this.child.offset();
            var x = e.pageX - offset.left;
            var y = e.pageY - offset.top;

            var zoom = 0;
            // deltaX => ignore

            zoom = Math.sign(e.originalEvent.deltaY);

            zoom = Math.pow(2, -zoom / 8.0);

            this.zoom(x, y, zoom);
        }
    }

    zoom(cx, cy, z) {
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


    setRawCurrentImagePos(e) {
        if (this.currentImg !== undefined) {
            $(this.currentImg).css("width", e.w + 'px');
            $(this.currentImg).css("height", e.h + 'px');
            $(this.currentImg).css('top', e.y + 'px');
            $(this.currentImg).css('left', e.x + 'px');

            if(this.loadingToDisplay) {
                $(this.loadingImg).css("width", e.w + 'px');
                $(this.loadingImg).css("height", e.h + 'px');
                $(this.loadingImg).css('top', e.y + 'px');
                $(this.loadingImg).css('left', e.x + 'px');
            }
        }
        this.currentImagePos = e;
    }

    setCurrentImagePos(e) {
        var viewSize = { x: this.child.width(), y: this.child.height()};
        // prevent zoom under 1.
        if (e.w < viewSize.x && e.h < viewSize.y) {
            e = this.getBestFit();
        } else {
            // Prevent black borders
            var viewSize = { x: this.child.width(), y: this.child.height()};
            var marginX = (e.w < viewSize.x) ? (viewSize.x - e.w) / 2 : 0;
            var minx = marginX;
            var maxx = viewSize.x - marginX;


            var marginY = (e.h < viewSize.y) ? (viewSize.y - e.h) / 2 : 0;
            var miny = marginY;
            var maxy = viewSize.y - marginY;

            if (e.x > minx) {
                e.x = minx;
            }
            if (e.y > miny) {
                e.y = miny;
            }
            if (e.x + e.w < maxx) {
                e.x = maxx - e.w;
            }
            if (e.y + e.h < maxy) {
                e.y = maxy - e.h;
            }
        }
        this.setRawCurrentImagePos(e);

        // Adjust the bin
        if (this.loadingDetailsPath == undefined) {
            // No path change. Make sure the path is the latest
            var path;
            if (this.loadingImgPath != undefined) {
                path = this.loadingImgPath;
            } else {
                path = this.currentImgPath;
            }
            var newSrc = this.computeSrc(path);
            this.setSrc(path, newSrc);
        }
    }

    getBestFit() {
        return this.getBestFitForSize(this.currentImageSize);
    }

    getBestFitForSize(imageSize) {
        var viewSize = { width: this.child.width(), height: this.child.height()};

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
        this.setRawCurrentImagePos(this.getBestFit());
        this.atBestFit = true;
    }
}

class FWHMDisplayer extends PureComponent {
    constructor(props) {
        super(props);
        this.state = {
            src: null,
            value: null,
            loading: false
        }
    }

    _loadData() {
        if (this.props.src === this.state.src) {
            return;
        }
        // Start a new loading.
        // cancel the previous request
        this._cancelLoadData();
        this.setState({
            src: this.props.src,
            value: null,
            loading: true
        });
        const self = this;

        this.request = this.props.app.appServerRequest('imageProcessor', {
                method: 'compute',
                details: {"starField":{ "source": { "path":this.props.src}}}
        }).then((e)=>{
            let fwhmSum = 0;
            for(let star of e) {
                fwhmSum += star.fwhm
            }
            if (e.length) {
                fwhmSum /= e.length;
            }

            const stat = fwhmSum.toFixed(2) + " - " + e.length + " stars"

            this.setState({
                value: stat,
                loading: false
            });
        }).onError((e)=> {
            this.setState({
                value: null, 
                loading: false
            });
        });
        this.request.start();
    }

    _cancelLoadData() {
        if (this.request !== undefined) {
            this.request.cancel();
            this.request = undefined;
        }
    }

    componentWillUnmount() {
        this._cancelLoadData();
    }

    componentDidMount() {
        this._loadData();
    }

    componentDidUpdate(prevProps, prevState) {
        this._loadData();
    }

    render() {
        if (this.state.value === null) {
            if (this.state.loading) {
                return <div>...</div>;
            } else {
                return <div>N/A</div>;
            }
        } else {
            return <div>{this.state.value}</div>
        }
    }
}

FWHMDisplayer.propTypes = {
    src: PropTypes.string.isRequired,
    app: PropTypes.any.isRequired
}

var uid = 0;

class FitsViewer extends PureComponent {
    constructor(props) {
        super(props);
        this.uid = uid++;
        this.state = {
            contextmenu: null,
            histogramView: null
        };

        this.displaySetting = this.displaySetting.bind(this);
        this.updateHisto = this.updateHisto.bind(this);
    }

    componentDidUpdate(prevProps) {
        this.ImageDisplay.setFullState(this.props.src, this.getViewSettingsCopy());
    }

    componentDidMount() {
        this.$el = $(this.el);
        this.ImageDisplay = new JQImageDisplay(this.$el, this.openContextMenu.bind(this), this.onViewSettingsChange.bind(this));
        this.ImageDisplay.setFullState(this.props.src, this.getViewSettingsCopy());
    }

    componentWillUnmount() {
        this.ImageDisplay.dispose();
        this.ImageDisplay = undefined;
        this.$el = undefined;
    }

    openContextMenu(x, y) {
        this.setState({contextmenu:{x:x, y:y}});
    }

    onViewSettingsChange(state)
    {
        this.props.onViewSettingsChange(state);
    }

    displaySetting(which) {
        if (which === 'fwhm') {
            this.setState({contextmenu: null, histogramView: null, fwhm: true});
        } else {
            this.setState({contextmenu: null, histogramView: (this.state.histogramView == which ? null : which), fwhm: false});
        }
    }

    getViewSettingsCopy()
    {
        var propValue = this.props.viewSettings;
        if (propValue == undefined) {
            propValue = {};
        }
        propValue = Obj.deepCopy(propValue);
        if (!('levels' in propValue)) {
            propValue.levels = {};
        }
        if (!('low' in propValue.levels)) propValue.levels.low = 0.05;
        if (!('medium' in propValue.levels)) propValue.levels.medium = 0.5;
        if (!('high' in propValue.levels)) propValue.levels.high = 0.95;

        return propValue;
    }

    updateHisto(which, v) {
        var newViewSettings = this.getViewSettingsCopy();
        newViewSettings.levels[which] = v;
        
        this.props.onViewSettingsChange(newViewSettings);
    }

    flushView() {
        if (this.ImageDisplay !== undefined) {
            this.ImageDisplay.flushView();
        }
    }
    render() {
        console.log('state is ', this.state);
        var contextMenu;
        if (this.state.contextmenu !== null) {
            contextMenu = <ContextMenu x={this.state.contextmenu.x} y={this.state.contextmenu.y}
                            displaySetting={this.displaySetting}
            />
        } else {
            contextMenu = null;
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
            histogramView = <FWHMDisplayer src={this.props.src} app={this.props.app}/>
        } else {
            histogramView = null;
        }
        return(
            <div className='FitsViewOverlayContainer'>
                <div className='FitsView' ref={el => this.el = el}/>
                <div className='FitsViewLoading'/>
                <div className='FitsSettingsOverlay'>
                    {histogramView}
                </div>
                {contextMenu}
            </div>);
    }

}

FitsViewer.propTypes = {
    src: PropTypes.string.isRequired,
    viewSettings: PropTypes.any,
    onViewSettingsChange: PropTypes.func.isRequired,
    app: PropTypes.any.isRequired
}

// connect(mapStateToProps)(
export default FitsViewer;