import { describe, expect, it, jest } from '@jest/globals';
import SkyProjection from '../SkyAlgorithms/SkyProjection';
import { locationShiftExceedsMinute, mapAltAz, SkyProjector, validLocation } from './projection';
import { segments, stars } from './skyData';

describe('minimap sky projection', () => {
    const now = Date.UTC(2026, 10, 8, 12);

    it('matches the existing north-up, east-right marker projection', () => {
        expect(mapAltAz(90, 0)).toEqual({ x: 0.5, y: 0.5 });
        expect(mapAltAz(0, 0)).toEqual({ x: 0.5, y: 0 });
        expect(mapAltAz(0, 90).x).toBeCloseTo(1);
        expect(mapAltAz(0, 180).y).toBeCloseTo(1);
        expect(mapAltAz(0, 270).x).toBeCloseTo(0);
    });

    it('keeps the existing horizontal projection finite at zenith', () => {
        const result = SkyProjection.lstRelRaDecToAltAz(
            { relRaDeg: 0, dec: -89.92 }, { lat: -89.92, long: 0 },
        );
        expect(result.alt).toBeCloseTo(90);
        expect(Number.isFinite(result.az)).toBe(true);
    });

    it('validates coordinates and compares cumulative location shifts with longitude wrap', () => {
        expect(validLocation(NaN, 0)).toBeUndefined();
        expect(validLocation(91, 0)).toBeUndefined();
        expect(validLocation(0, 361)).toBeUndefined();
        const origin = { lat: 0, long: 0 };
        expect(locationShiftExceedsMinute(origin, { lat: 0.24, long: 0 })).toBe(false);
        expect(locationShiftExceedsMinute(origin, { lat: 0.26, long: 0 })).toBe(true);
        expect(locationShiftExceedsMinute(origin, { lat: 0.2, long: 0.2 })).toBe(true);
        expect(locationShiftExceedsMinute({ lat: 0, long: 359.9 }, { lat: 0, long: 0.1 })).toBe(false);
    });

    it('contains valid bounded data and valid segment endpoints in both hemispheres', () => {
        expect(stars.length).toBeLessThanOrEqual(1000);
        expect(segments.length).toBeLessThanOrEqual(1500);
        expect(new Set(stars.map(star => star[0])).size).toBe(stars.length);
        expect(stars.some(star => star[2] > 45)).toBe(true);
        expect(stars.some(star => star[2] < -45)).toBe(true);
        stars.forEach(([id, ra, dec, mag]) => {
            expect(Number.isInteger(id)).toBe(true);
            expect(ra).toBeGreaterThanOrEqual(0);
            expect(ra).toBeLessThan(360);
            expect(dec).toBeGreaterThanOrEqual(-90);
            expect(dec).toBeLessThanOrEqual(90);
            expect(Number.isFinite(mag)).toBe(true);
        });
        segments.forEach(([a, b]) => {
            expect(a).toBeGreaterThanOrEqual(0);
            expect(b).toBeGreaterThanOrEqual(0);
            expect(a).toBeLessThan(stars.length);
            expect(b).toBeLessThan(stars.length);
        });
    });

    it('projects fixed skies, clips horizon crossings and rejects below-horizon segments', () => {
        const epoch = jest.spyOn(SkyProjection, 'raDecEpochFromJ2000').mockImplementation(position => position);
        const lst = SkyProjection.getLocalSideralTime(now, 0);
        const fixture: Array<[number, number, number, number]> = [
            [1, lst + 60, 0, 1], [2, lst + 120, 0, 1],
            [3, lst + 140, 0, 1], [4, lst, 60, 1], [5, lst, -60, 1],
        ];
        const projector = new SkyProjector(fixture, [[0, 1], [1, 2]]);
        const result = projector.project({ lat: 0, long: 0 }, now);
        const coordinates = result.lines.match(/-?\d+\.\d+/g)!.map(Number);
        expect(coordinates.length).toBeGreaterThan(0);
        for (let i = 0; i < coordinates.length; i += 2) {
            expect(Math.hypot(coordinates[i] - 0.5, coordinates[i + 1] - 0.5)).toBeLessThanOrEqual(0.50001);
        }
        expect(coordinates[coordinates.length - 2]).toBeCloseTo(1, 4);
        expect(coordinates[coordinates.length - 1]).toBeCloseTo(0.5, 4);
        const belowOnly = new SkyProjector(fixture, [[1, 2]]).project({ lat: 0, long: 0 }, now);
        expect(belowOnly.lines).toBe('');
        const north = new SkyProjector([fixture[3]], []).project({ lat: 45, long: 0 }, now);
        const south = new SkyProjector([fixture[4]], []).project({ lat: -45, long: 0 }, now);
        expect(north.stars.join('')).not.toBe('');
        expect(south.stars.join('')).not.toBe('');
        epoch.mockRestore();
    });

    it('projects stars across RA zero continuously and excludes stars below the horizon', () => {
        const epoch = jest.spyOn(SkyProjection, 'raDecEpochFromJ2000').mockImplementation(position => position);
        const nowAtZero = Date.UTC(2026, 10, 8);
        const location = { lat: 0, long: -SkyProjection.getLocalSideralTime(nowAtZero, 0) };
        const projector = new SkyProjector([
            [1, 359, 0, 1], [2, 1, 0, 1], [3, 180, 0, 1],
        ], [[0, 1]]);
        const result = projector.project(location, nowAtZero);
        expect((result.stars[1].match(/M/g) || []).length).toBe(2);
        const coords = result.lines.match(/-?\d+\.\d+/g)!.map(Number);
        coords.forEach(value => expect(value).toBeGreaterThan(0.48));
        coords.forEach(value => expect(value).toBeLessThan(0.52));
        epoch.mockRestore();
    });

    it('uses daily epoch caching with less than 0.05 degrees deviation', () => {
        const spy = jest.spyOn(SkyProjection, 'raDecEpochFromJ2000');
        const catalog = stars.slice(0, 10);
        const projector = new SkyProjector(catalog, []);
        const start = Date.UTC(2026, 10, 8);
        projector.project({ lat: 35, long: -70 }, start);
        projector.project({ lat: 35, long: -70 }, start + 86399999);
        expect(spy).toHaveBeenCalledTimes(catalog.length);
        catalog.forEach(([, ra, dec]) => {
            const middle = SkyProjection.raDecEpochFromJ2000([ra, dec], start + 43200000);
            [start, start + 86399999].forEach(time => {
                const fresh = SkyProjection.raDecEpochFromJ2000([ra, dec], time);
                const dra = ((fresh[0] - middle[0] + 540) % 360) - 180;
                expect(Math.hypot(dra * Math.cos(dec * Math.PI / 180), fresh[1] - middle[1])).toBeLessThan(0.05);
            });
        });
        spy.mockRestore();
    });
});
