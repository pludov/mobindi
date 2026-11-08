import "source-map-support/register";
import * as assert from 'assert';
import 'mocha';
import { expect } from 'chai';
import ImageProcessor, * as PlaneFinder from "./ImageProcessor";
import { ProcessorHistogramChannel } from "./shared/ProcessorTypes";


const tol = 1e-6;
const data: ProcessorHistogramChannel = {
    min: 5,
    max: 10,
    pixcount: 1,
    bitpix: 8,
    identifier: "test",
    data: [3, 4, 8, 8, 12, 13]
};


describe("Search histogram levels",  ()=> {
    it("Find adu at bounds", ()=>{
        assert.strictEqual(ImageProcessor.getHistgramAduLevel(data, 0), 5);
        assert.strictEqual(ImageProcessor.getHistgramAduLevel(data, 13), 10);
    });

    it("Report adu over bounds", ()=>{
        assert.strictEqual(ImageProcessor.getHistgramAduLevel(data, -1), 5);
        assert.strictEqual(ImageProcessor.getHistgramAduLevel(data, 14), 10);
    });

    it("Find adu within bounds", ()=>{
        assert.strictEqual(ImageProcessor.getHistgramAduLevel(data, 4), 6);
        assert.strictEqual(ImageProcessor.getHistgramAduLevel(data, 5), 7);
    });

    it("Find mean adu over whole range", ()=>{
        // This one will return the weighted mean of all samples : (5*3 +6*1 + 7 * 4 + 8*0 + 9 *4 +10*1 ) / 13= 7,307692308
        assert.strictEqual(ImageProcessor.getHistogramAduLevelMean(data, 0, 13).toFixed(8), 7.307692308.toFixed(8));
    });

    it("Find mean adu over extrem ranges", ()=>{
        // This one will return the weighted mean of all samples : (5*3 +6*1 + 7 * 4 + 8*0 + 9 *4 +10*1 ) / 13= 7,307692308
        assert.strictEqual(ImageProcessor.getHistogramAduLevelMean(data, 0, 1), 5.0);
        assert.strictEqual(ImageProcessor.getHistogramAduLevelMean(data, 12, 13), 10.0);
    });

    it("Find mean adu at precise extrema", ()=>{
        assert.strictEqual(ImageProcessor.getHistogramAduLevelMean(data, 0, 0), 5.0);
        assert.strictEqual(ImageProcessor.getHistogramAduLevelMean(data, 13, 13), 10.0);
    });

    it("Find mean adu at random ranges", ()=>{
        // The two first samples, weighted 3, 1, will return (3*5 + 1*6) / 4 = 5.25
        assert.strictEqual(ImageProcessor.getHistogramAduLevelMean(data, 0, 4), 5.25);
        assert.strictEqual(ImageProcessor.getHistogramAduLevelMean(data, 4, 8), 7);
        // 9x4 + 10x1 = (9*4 + 10) / 5 = 9.2
        assert.strictEqual(ImageProcessor.getHistogramAduLevelMean(data, 8, 14), 9.2);
        // 9x3 + 10x1 = 37 / 4 = 9.25
        assert.strictEqual(ImageProcessor.getHistogramAduLevelMean(data, 9, 14), 9.25);
        // 9x2 + 10x1 = 28 / 3 = 9.333333333333
        assert.strictEqual(ImageProcessor.getHistogramAduLevelMean(data, 10, 14).toFixed(6), 9.333333333333.toFixed(6));
    });

});
