import $ from 'jquery';

type ImagePos = {
    x:number;
    y:number;
    w:number;
    h:number;
}

class Crosshair {
    parent: JQuery<HTMLDivElement>;
    hbar: JQuery<HTMLDivElement>;
    vbar: JQuery<HTMLDivElement>;

    Crosshair() {
    }

    remove() {
        this.hbar.remove();
    }

    private newDiv(): JQuery<HTMLDivElement> {
        const obj: JQuery<HTMLDivElement> = $("<div></div>");
        obj.css('display', 'block');
        obj.css('overflow', 'hidden');
        obj.css('background', '#ff0000');
        obj.css('pointer-events', 'none');
        obj.css('box-sizing', 'border-box');
        obj.css('position', 'absolute');
        obj.css('border', '0px');

        return obj;
    }

    attach(parent: JQuery<HTMLDivElement>) {
        this.parent = parent;

        this.hbar = this.newDiv();
        this.hbar.css('width', '100%');
        this.hbar.css('height', '1px');
        this.hbar.css('top', '-1px');
        this.hbar.css('left', '0');

        this.parent.append(this.hbar);

        this.vbar = this.newDiv();
        this.vbar.css('width', '1px');
        this.vbar.css('height', '100%');
        this.vbar.css('top', '0');
        this.vbar.css('left', '-1px');

        this.parent.append(this.vbar);
    }

    update(imagePos: ImagePos) {
        let centerx = imagePos.x + imagePos.w / 2;
        this.vbar.css('left', `${centerx - 0.5}px`);

        let centery = imagePos.y + imagePos.h / 2;
        this.hbar.css('top', `${centery - 0.5}px`);
    }

    getElements() : JQuery<HTMLElement> {
        return $([this.hbar[0], this.vbar[0]]);
    }
};

export default Crosshair;