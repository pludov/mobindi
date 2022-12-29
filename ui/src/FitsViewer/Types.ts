export type ImageSize = {
    width: number;
    height: number;
}

export type Point = {
    x: number;
    y: number;
}

export type Rectangle = {
    x: number;
    y: number;
    w: number;
    h: number;
}

export type SubFrame = {
    x: number;
    y: number;
    w: number;
    h: number;

    maxW: number;
    maxH: number;
}

export type LevelId = "low"|"medium"|"high";

export type Levels = {
    low: number;
    medium: number;
    high: number;
}

export type FullState = {
    levels: Levels;
    crosshair?: boolean;
    autoCrop?: boolean;
}

// Info returned by size CGI
export type ImageDetails = {
    width: number;
    height: number;
    color: boolean;
}
