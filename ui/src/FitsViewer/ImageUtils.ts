import { ImageSize, Point, Rectangle } from "./Types";

export function intersect(r1: Rectangle, r2: Rectangle) {
    if (r1.x >= r2.x + r2.w) return false;
    if (r1.y >= r2.y + r2.h) return false;
    if (r2.x >= r1.x + r1.w) return false;
    if (r2.y >= r1.y + r1.h) return false;
    
    return true;
}

export function rectInclude(r: Rectangle, p: Point): boolean
{
    return p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
}

export function pointMin(p1: Point, p2: Point)
{
    return {
        x: Math.min(p1.x, p2.x),
        y: Math.min(p1.y, p2.y),
    };
}

export function pointMax(p1: Point, p2: Point)
{
    return {
        x: Math.max(p1.x, p2.x),
        y: Math.max(p1.y, p2.y),
    };
}

export function growToBinBoundary(r: Rectangle, bin: number)
{
    const binSize = 2 ** bin;
    let x0 = Math.floor(r.x / binSize) * binSize;
    let y0 = Math.floor(r.y / binSize) * binSize;
    
    let x1 = Math.ceil((r.x + r.w) / binSize) * binSize;
    let y1 = Math.ceil((r.y + r.h) / binSize) * binSize;
    return {
        x: x0,
        y: y0,
        w: x1 - x0,
        h: y1 - y0,
    };
}

export function getBestFitForSize(imageSize:ImageSize, viewSize: ImageSize) {
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
