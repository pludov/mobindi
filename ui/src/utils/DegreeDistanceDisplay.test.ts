import * as DegreeDistanceDisplay from './DegreeDistanceDisplay';

describe("DegreeDistanceDisplay", ()=> {
    it('display  ok', () => {
        expect(DegreeDistanceDisplay.deltaTitle(0)).toBe('0"');

        expect(DegreeDistanceDisplay.deltaTitle(0.6/3600)).toBe(`+1"`);
        expect(DegreeDistanceDisplay.deltaTitle(-0.6/3600)).toBe(`-1"`);

        expect(DegreeDistanceDisplay.deltaTitle(61/3600)).toBe(`+1'01"`);

        expect(DegreeDistanceDisplay.deltaTitle(300/3600)).toBe(`+5'00"`);
        expect(DegreeDistanceDisplay.deltaTitle(302/3600)).toBe(`+5'02"`);

        expect(DegreeDistanceDisplay.deltaTitle(2)).toBe(`+2°00'`);

        expect(DegreeDistanceDisplay.deltaTitle(1.9)).toBe(`+1°54'`);
    });

});
