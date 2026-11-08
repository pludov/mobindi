import SkyProjection from '../SkyAlgorithms/SkyProjection';
import { stars, segments } from './skyData';

export type Location = { lat: number; long: number };
type Vector = [number, number, number];
type Point = { x: number; y: number };
type Horizontal = { alt: number; az: number };
type EpochStar = { vector: Vector; magnitude: number };
export type SkyPaths = { lines: string; stars: string[] };

const rad = Math.PI / 180;
const day = 24 * 60 * 60 * 1000;
const siderealMinute = 360 * 60 / 86164.0905;

export function mapAltAz(alt: number, az: number): Point {
    const distance = 0.5 * (90 - alt) / 90;
    return { x: 0.5 + distance * Math.sin(az * rad), y: 0.5 - distance * Math.cos(az * rad) };
}

export function validLocation(lat: number | undefined, long: number | undefined): Location | undefined {
    if (lat === undefined || long === undefined || !Number.isFinite(lat) || !Number.isFinite(long) ||
        lat < -90 || lat > 90 || long < -180 || long > 360) {
        return undefined;
    }
    return { lat, long };
}

export function locationShiftExceedsMinute(a: Location, b: Location): boolean {
    const latitude = (a.lat - b.lat) * rad / 2;
    const longitude = (a.long - b.long) * rad / 2;
    const cosHalf = Math.min(1, Math.abs(Math.cos(latitude) * Math.cos(longitude)));
    return 2 * Math.acos(cosHalf) / rad > siderealMinute;
}

function vector(ra: number, dec: number): Vector {
    const r = ra * rad;
    const d = dec * rad;
    return [Math.cos(d) * Math.cos(r), Math.cos(d) * Math.sin(r), Math.sin(d)];
}

function interpolate(a: Vector, b: Vector, angle: number, t: number): Vector {
    if (angle < 1e-8) return a;
    const divisor = Math.sin(angle);
    const x = Math.sin((1 - t) * angle) / divisor;
    const y = Math.sin(t * angle) / divisor;
    return [x * a[0] + y * b[0], x * a[1] + y * b[1], x * a[2] + y * b[2]];
}

function horizontal(v: Vector, lst: number, location: Location): Horizontal {
    const ra = Math.atan2(v[1], v[0]) / rad;
    const dec = Math.asin(Math.max(-1, Math.min(1, v[2]))) / rad;
    return SkyProjection.lstRelRaDecToAltAz({ relRaDeg: ra - lst, dec }, location);
}

function format(point: Point): string {
    return `${point.x.toFixed(5)} ${point.y.toFixed(5)}`;
}

function circle(point: Point, radius: number): string {
    const x = point.x.toFixed(5);
    const y = point.y.toFixed(5);
    return `M${x} ${y}m-${radius} 0a${radius} ${radius} 0 1 0 ${2 * radius} 0a${radius} ${radius} 0 1 0 -${2 * radius} 0`;
}

export class SkyProjector {
    private epochDay: number | undefined;
    private epochStars: EpochStar[] = [];

    constructor(
        private readonly catalog: ReadonlyArray<readonly [number, number, number, number]> = stars,
        private readonly connections: ReadonlyArray<readonly [number, number]> = segments,
    ) {}

    project(location: Location, now: number): SkyPaths {
        const currentDay = Math.floor(now / day);
        if (this.epochDay !== currentDay) {
            const epoch = currentDay * day + day / 2;
            this.epochStars = this.catalog.map(([, ra, dec, magnitude]) => {
                const position = SkyProjection.raDecEpochFromJ2000([ra, dec], epoch);
                return { vector: vector(position[0], position[1]), magnitude };
            });
            this.epochDay = currentDay;
        }
        const lst = SkyProjection.getLocalSideralTime(now, location.long);
        const positions = this.epochStars.map(star => horizontal(star.vector, lst, location));
        const starPaths = ['', '', ''];
        positions.forEach((position, i) => {
            if (position.alt < 0) return;
            const magnitude = this.epochStars[i].magnitude;
            const group = magnitude < 1 ? 0 : magnitude < 2.5 ? 1 : 2;
            const radius = [0.0045, 0.0033, 0.0023][group];
            starPaths[group] += circle(mapAltAz(position.alt, position.az), radius);
        });

        let linePath = '';
        this.connections.forEach(([first, second]) => {
            // A minor great-circle arc cannot leave a hemisphere containing both endpoints.
            if (positions[first].alt < 0 && positions[second].alt < 0) return;
            const a = this.epochStars[first].vector;
            const b = this.epochStars[second].vector;
            const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
            const angle = Math.acos(dot);
            if (angle < 1e-8 || Math.PI - angle < 1e-8) return;
            const count = Math.ceil(angle / (5 * rad));
            const at = (t: number) => horizontal(interpolate(a, b, angle, t), lst, location);
            let previousT = 0;
            let previous = positions[first];
            for (let i = 1; i <= count; i++) {
                const currentT = i / count;
                const current = i === count ? positions[second] : at(currentT);
                let start = previous;
                let end = current;
                if ((previous.alt >= 0) !== (current.alt >= 0)) {
                    let low = previousT;
                    let high = currentT;
                    for (let iteration = 0; iteration < 16; iteration++) {
                        const mid = (low + high) / 2;
                        if ((at(mid).alt >= 0) === (previous.alt >= 0)) low = mid;
                        else high = mid;
                    }
                    const crossing = at((low + high) / 2);
                    crossing.alt = 0;
                    if (previous.alt < 0) start = crossing;
                    else end = crossing;
                }
                if (previous.alt >= 0 || current.alt >= 0) {
                    linePath += `M${format(mapAltAz(start.alt, start.az))}L${format(mapAltAz(end.alt, end.az))}`;
                }
                previous = current;
                previousT = currentT;
            }
        });
        return { lines: linePath, stars: starPaths };
    }
}
