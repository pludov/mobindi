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
    }

    showLow() { this.props.displaySetting('low'); }
    showMedium() { this.props.displaySetting('medium'); }
    showHigh() { this.props.displaySetting('high'); }

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
            </div>);
    }
}

class LevelBar extends PureComponent {
    constructor(props) {
        super(props);
        this.sendUpdate = this.sendUpdate.bind(this);
    }
    sendUpdate(v) {
        console.log('changing to ', v.target.valueAsNumber);
        this.props.onChange(this.props.property, v.target.valueAsNumber);
    }
    render() {
        return (
            <div className="ImageBarSetting">
                <div className="ImageBarContainer">
                    <input type='range' min='0' max='1' step='any' value={this.props.value} onChange={this.sendUpdate}/>
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

        this.loadingImg = undefined;
        // The path (without cgi settings)
        this.loadingImgSrc = undefined;
        this.loadingImgPath = undefined;
        this.loadingToDisplay = false;
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

        this.currentImageSize = {x: -1, y: -1};
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
            str = 'fitsviewer/fitsviewer.cgi?path=' + encodeURIComponent(path);
            str += '&low=' + this.levels.low;
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
        this.setSrc(path, this.computeSrc(path));
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
    }

    getBestFit() {
        return this.getBestFitForSize(this.currentImageSize);
    }

    getBestFitForSize(imageSize) {
        var viewSize = { x: this.child.width(), y: this.child.height()};

        if (imageSize.x == 0
            || imageSize.y == 0
            || viewSize.x == 0
            || viewSize.y == 0)
        {
            // Don't bother
            return {x: 0, y:0, w: viewSize.x, h: viewSize.y};

        }
        // If image is larger than view
        // imageSize.x / imageSize.y > viewSize.x / viewSize.y
        // imageSize.x * viewSize.y > viewSize.x * imageSize.y
        else if (imageSize.x * viewSize.y > viewSize.x * imageSize.y) {
            // scale for width and adjust height
            var heightInClient = viewSize.x * imageSize.y / imageSize.x;
            return {x: 0, y:(viewSize.y - heightInClient) / 2, w: viewSize.x, h: heightInClient};
        } else {
            // Scale for height and adjust width
            var widthInClient = viewSize.y * imageSize.x / imageSize.y;
            return {x: ((viewSize.x - widthInClient) / 2), y:0, w: widthInClient, h: viewSize.y};
        }
    }

    // Max zoom keeping aspect ratio
    bestFit() {
        // Move the img
        this.setRawCurrentImagePos(this.getBestFit());
        this.atBestFit = true;
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
        this.child.empty();

        if (this.currentImg !== undefined) {
            this.currentImageSize = {x: newImage.naturalWidth, y: newImage.naturalHeight};
            
            $(this.currentImg).css('position', 'relative');

            this.child.append(this.currentImg);

            if (previousImg == undefined || previousSize.x != this.currentImageSize.x || previousSize.y != this.currentImageSize.y) {
                this.bestFit();
            } else {
                $(this.currentImg).css('top', $(previousImg).css('top'));
                $(this.currentImg).css('left', $(previousImg).css('left'));
                $(this.currentImg).css('width', $(previousImg).css('width'));
                $(this.currentImg).css('height', $(previousImg).css('height'));
            }
        }
    }


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
        this.setState({contextmenu: null, histogramView: (this.state.histogramView == which ? null : which)});
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
            histogramView = <LevelBar property={this.state.histogramView} onChange={this.updateHisto} value={viewSettings.levels[this.state.histogramView]}></LevelBar>;
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
    onViewSettingsChange: PropTypes.func.isRequired
}

// connect(mapStateToProps)(
export default FitsViewer;