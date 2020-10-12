import $ from 'jquery';

type MouseMoveListenerOptions= {
    openContextMenu: (cx: number, dy:number)=>void;
    closeContextMenu: ()=>void;
    zoom: (cx:number, cy:number, z:number)=>void;
    drag: (dx: number, dy: number)=>void;
    endDrag: ()=>void;
}

type PendingAction = {
    zoom?: {cx:number, cy: number, z:number};
    drag?: {dx: number, dy: number};
}

let globalListener:ScreenMouseMoveListener|undefined = undefined;

class ScreenMouseMoveListener {
    menuTimer:NodeJS.Timeout|null = null;
    touches = {};
    mouseIsDown:boolean = false;
    mouseDragged:boolean = false;
    mouseDragPos?:{x:number, y:number} = undefined;
    draggedSinceInstall: boolean  = false;
    child : JQuery<HTMLDivElement>;
    options: MouseMoveListenerOptions;

    pendingAction: PendingAction = {};
    pendingActionTimer:NodeJS.Timeout|undefined = undefined;


    constructor(child : JQuery<HTMLDivElement>, options: MouseMoveListenerOptions) {
        this.child = child;
        this.options = options;
    }

    flushActions=()=>{
        if (this.pendingActionTimer !== undefined) {
            clearTimeout(this.pendingActionTimer);
            this.pendingActionTimer = undefined;
        }
        if (this.pendingAction.zoom) {
            this.options.zoom(this.pendingAction.zoom.cx, this.pendingAction.zoom.cy, this.pendingAction.zoom.z);
            this.pendingAction.zoom = undefined;
        }
        if (this.pendingAction.drag) {
            this.options.drag(this.pendingAction.drag.dx, this.pendingAction.drag.dy);
            this.pendingAction.drag = undefined;
        }
    }

    pushAction(a: PendingAction) {
        if (a.zoom) {
            if (this.pendingAction.drag) {
                this.flushActions();
            }

            if (this.pendingAction.zoom) {
                // FIXME : adjust center ?
                this.pendingAction.zoom.cx = a.zoom.cx;
                this.pendingAction.zoom.cy = a.zoom.cy;
                this.pendingAction.zoom.z *= a.zoom.z;
            } else {
                this.pendingAction.zoom = {...a.zoom}
            }
        }
        if (a.drag) {
            this.draggedSinceInstall = true;
            if (this.pendingAction.zoom) {
                this.flushActions();
            }
            if (this.pendingAction.drag) {
                this.pendingAction.drag.dx += a.drag.dx;
                this.pendingAction.drag.dy += a.drag.dy;
            } else {
                this.pendingAction.drag = {...a.drag}
            }
        }
        if (this.pendingActionTimer === undefined) {
            this.pendingActionTimer = setTimeout(this.flushActions, 20);
        }
    }

    install() {
        if (globalListener === this) {
            return;
        }
        if (globalListener !== undefined) {
            globalListener.dispose();
        }
        globalListener = this;
        this.draggedSinceInstall = false;
        const body:JQuery<HTMLDivElement> = $(document.body) as any;
        body.on('click', this.click);
        body.on('wheel', this.wheel);
        body.on('mousedown', this.mousedown);
        body.on('mouseup', this.mouseup);
        body.on('mousemove', this.mousemove);
        body.on('mouseleave', this.mouseleave);
        body.on('dragstart', this.dragstart);
        body.on('touchmove', this.touchmove);
        body.on('touchstart', this.touchstart);
        body.on('touchend', this.touchend);
        body.on('touchcancel', this.touchcancel);
        body.on('touchleave', this.touchleave);
        body.on('contextmenu', this.contextmenu);
    }


    dispose() {
        if (globalListener === this) {
            globalListener = undefined;
        }
        this.cancelMenuTimer();
        const body:JQuery<HTMLDivElement> = $(document.body) as any;
        body.off('click', this.click);
        body.off('wheel', this.wheel);
        body.off('mousedown', this.mousedown);
        body.off('mouseup', this.mouseup);
        body.off('mousemove', this.mousemove);
        body.off('mouseleave', this.mouseleave);
        body.off('dragstart', this.dragstart);
        body.off('touchmove', this.touchmove);
        body.off('touchstart', this.touchstart);
        body.off('touchend', this.touchend);
        body.off('touchcancel', this.touchcancel);
        body.off('touchleave', this.touchleave);
        body.off('contextmenu', this.contextmenu);
        if (this.draggedSinceInstall) {
            this.options.endDrag();
        }
    }

    cancelMenuTimer() {
        if (this.menuTimer !== null) {
            clearTimeout(this.menuTimer);
            this.menuTimer =  null;
        }
    }

    checkDone() {
        if (Object.keys(this.touches).length === 0 && !this.mouseIsDown) {
            this.flushActions();
            this.dispose();
        }
    }

    readonly touchstart=(e:JQuery.TouchStartEvent<HTMLDivElement>)=>{
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
                this.flushActions();
                this.contextMenuAt(where.x, where.y);
            }, 400);
        } else {
            this.flushActions();
            this.options.closeContextMenu();
        }
        this.checkDone();
    }

    private readonly touchend=(e:JQuery.TouchEventBase<HTMLDivElement>)=>{
        e.preventDefault();
        this.cancelMenuTimer();
        var touches = e.originalEvent!.changedTouches;
        for (var i = 0; i < touches.length; i++) {
            var uid = "t:" + touches[i].identifier;
            delete this.touches[uid];
        }
        this.checkDone();
    }

    private readonly touchcancel=(e:JQuery.TouchCancelEvent<HTMLDivElement>)=>{
        this.touchend(e);
    }

    private readonly touchleave=(e:JQuery.TriggeredEvent<HTMLDivElement>)=>{
        e.preventDefault();
        // Forget all current touches
        this.touches = {};
        this.checkDone();
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

                this.pushAction({zoom: {cx: cx - offset.left, cy: cy - offset.top, z: after.d / before.d}});
            }

            if (before.x != after.x || before.y != after.y) {
                var dx = after.x - before.x;
                var dy = after.y - before.y;
            }

        } else if (activeTouches.length == 1 && Object.prototype.hasOwnProperty.call(newTouches, activeTouches[0])) {
            var uid = activeTouches[0];
            var oldPos = this.touches[uid];
            var newPos = newTouches[uid];
            // It's a drag
            var dx = newPos.x - oldPos.x;
            var dy = newPos.y - oldPos.y;

            this.pushAction({drag: {dx, dy}});

            Object.assign(this.touches, newTouches);
        } else {
            Object.assign(this.touches, newTouches);
        }
        this.checkDone();
    }


    private readonly dragstart=(e:JQuery.TriggeredEvent<HTMLDivElement>)=>{
        e.preventDefault();
    }

    readonly mousedown=(e:JQuery.MouseDownEvent<HTMLDivElement>)=>{
        if (e.which == 1) {
            this.mouseIsDown = true;
            this.setMouseDragged(false);
            this.mouseDragPos = {x: e.originalEvent!.pageX, y: e.originalEvent!.pageY};
            this.flushActions();
            this.options.closeContextMenu();
            this.checkDone();
        }
    }

    private readonly mouseleave=(e:JQuery.MouseLeaveEvent<HTMLDivElement>)=>{
        this.mouseIsDown = false;
        this.setMouseDragged(false);
        this.mouseDragPos = undefined;
        this.checkDone();
    }

    private readonly mousemove=(e:JQuery.MouseMoveEvent<HTMLDivElement>)=>{
        if (this.mouseIsDown) {
            this.setMouseDragged(true);

            var prevPos = this.mouseDragPos!;
            this.mouseDragPos = {x: e.originalEvent!.pageX, y: e.originalEvent!.pageY};

            const dx = (this.mouseDragPos.x - prevPos.x);
            const dy = (this.mouseDragPos.y - prevPos.y);
            this.pushAction({drag: {dx, dy}});
        }
    }

    private readonly mouseup=(e:JQuery.MouseUpEvent<HTMLDivElement>)=>{
        if (e.which == 1) {
            this.mouseIsDown = false;
            e.preventDefault()

            this.setMouseDragged(false);
            this.checkDone();
        }
    }

    private readonly setMouseDragged=(to:boolean)=>{
        if (this.mouseDragged == to) return;
        this.mouseDragged = to;
        this.child.css('pointer', to ? 'hand' : 'inherit');
    }



    private contextMenuAt(pageX:number, pageY:number)
    {
        var offset = this.child.offset()!;
        var x = pageX - offset.left;
        var y = pageY - offset.top;
        this.flushActions();
        this.dispose();
        this.options.openContextMenu(x, y);
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

            this.pushAction({zoom: {cx: x, cy: y, z: zoom}});
        }
    }

    private readonly contextmenu=(e:JQuery.ContextMenuEvent<HTMLDivElement>)=>{
        e.preventDefault();
        this.contextMenuAt(e.pageX, e.pageY);
    }

    private readonly click=(e:JQuery.ClickEvent<HTMLDivElement>)=>{
        e.preventDefault();
        // FIXME: prevent clic from drag from mouseup ?

    }
}


export default class MouseMoveListener {
    child : JQuery<HTMLDivElement>;
    options: MouseMoveListenerOptions;
    screenListener: ScreenMouseMoveListener;

    constructor(elt:JQuery<HTMLDivElement>, options:MouseMoveListenerOptions) {
        this.child = elt;
        this.options = options;
        elt.on('click', this.click);
        elt.on('wheel', this.wheel);
        elt.on('mousedown', this.mousedown);
        elt.on('dragstart', this.dragstart);
        elt.on('touchstart', this.touchstart);
        elt.on('contextmenu', this.contextmenu);
        this.screenListener = new ScreenMouseMoveListener(this.child, this.options);
    }

    dispose() {
        this.child.off('click', this.click);
        this.child.off('wheel', this.wheel);
        this.child.off('mousedown', this.mousedown);
        this.child.off('dragstart', this.dragstart);
        this.child.off('touchstart', this.touchstart);
        this.child.off('contextmenu', this.contextmenu);
        this.child.empty();
        this.screenListener.dispose();
    }

    private installListener() {
        this.screenListener.install();
    }

    private readonly touchstart=(e:JQuery.TouchStartEvent<HTMLDivElement>)=>{
        this.installListener();
        this.screenListener.touchstart(e);
    }

    private readonly dragstart=(e:JQuery.TriggeredEvent<HTMLDivElement>)=>{
        e.preventDefault();
    }

    private readonly mousedown=(e:JQuery.MouseDownEvent<HTMLDivElement>)=>{
        this.installListener();
        this.screenListener.mousedown(e);
    }


    private contextMenuAt(pageX:number, pageY:number)
    {
        var offset = this.child.offset()!;
        var x = pageX - offset.left;
        var y = pageY - offset.top;
        this.options.openContextMenu(x, y);
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

            this.options.zoom(x, y, zoom);
        }
    }

    private readonly contextmenu=(e:JQuery.ContextMenuEvent<HTMLDivElement>)=>{
        e.preventDefault();
        this.contextMenuAt(e.pageX, e.pageY);
    }

    private readonly click=(e:JQuery.ClickEvent<HTMLDivElement>)=>{
        e.preventDefault();
        // FIXME: prevent clic from drag from mouseup ?

    }
}