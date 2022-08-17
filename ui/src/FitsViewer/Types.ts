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

export type LevelId = "low"|"medium"|"high";

export type Levels = {
    low: number;
    medium: number;
    high: number;
}

// When content is actually a subframe
// Gives actual margin in 0-1 range
export type Window = {
    top: number;
    left: number;
    bottom: number;
    right: number;
};

export type FullState = {
    levels: Levels;
    crosshair?: boolean;
}
