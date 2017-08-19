import React, { Component, PureComponent} from 'react';
import { connect } from 'react-redux';
import $ from 'jquery';

const jqBindedEvents = ['click', 'wheel','mousedown', 'mouseup', 'mousemove', 'mouseleave', 'dragstart', 'touchmove', 'touchstart', 'touchend', 'touchcancel', 'touchleave', 'contextmenu' ];

class JQImageDisplay {



    constructor(elt) {
        this.currentImg = undefined;
        this.loadingImg = undefined;
        this.child = elt;

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

        // Contains the coordonates of the center, and the distance (in image pixel) of the closer view border
        this.coords = {x: 0, y: 0, dstToBorder: 0, bestFit: 1};

        // While the bestFit is active (cleared by moves)
        this.atBestFit = true;
    }

    dispose() {
        for(var event of jqBindedEvents) {
            var func = event.replace(/-/,'');
            this.child.off(event, this[func]);
        }
        this.child.empty();
    }

    abortLoading() {
        if (this.loadingImg != undefined) {
            this.loadingImg.src = null;
            this.loadingImg = null;
            this.child.removeClass('Loading');
        }
    }

    setSrc(src) {
        var self = this;

        if ((this.currentImg != undefined) && (this.currentImg.src == src)) {
            this.abortLoading();
            return;
        }
        if ((this.loadingImg != undefined) && (this.loadingImg.src == src)) {
            return;
        }

        this.abortLoading();

        var newImage = new Image();
        newImage.onload = (() => { console.warn('image loaded ok'); self.loaded(newImage, true) });
        newImage.onerror = ((e) => { console.warn('image loading failed', e); self.loaded(newImage, false) });
        newImage.src = src;
        console.log('Loading image: ' + src);
        this.loadingImg = newImage;
        this.child.addClass('Loading');
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
    }

    touchend(e) {
        e.preventDefault();
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


    contextmenu(e) {
        e.preventDefault();
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



    loaded(newImage, result) {
        if (newImage !== this.loadingImg) {
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

        this.loadingImg = undefined;
        this.currentImg = result ? newImage : undefined;
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
    }

    componentDidUpdate(prevProps) {
        this.ImageDisplay.setSrc(this.props.src);
    }

    componentDidMount() {
        this.$el = $(this.el);
        this.ImageDisplay = new JQImageDisplay(this.$el);
        this.ImageDisplay.setSrc(this.props.src);
    }

    componentWillUnmount() {
        this.ImageDisplay.dispose();
        this.ImageDisplay = undefined;
        this.$el = undefined;
    }

    render() {
        return(
            <div className='FitsViewOverlayContainer'>
                <div className='FitsView' ref={el => this.el = el}/>
                <div className='FitsViewLoading'/>
            </div>);
    }

}

// connect(mapStateToProps)(
export default FitsViewer;