import "source-map-support/register";
import { expect, assert } from 'chai';

import { SequenceParamClassifier } from "./SequenceParamClassifier";

describe("SequenceParamClassifier", () => {

    it("Order parameter by importance", () => {
        const classifier = new SequenceParamClassifier();
        const params = classifier.exposureParamsOrdered;

        assert.deepStrictEqual(params, [
            "type", "exposure", "filter", "bin", "iso"
        ]);
    });

    it("Classify sequence parameters", ()=> {
        const classifier = new SequenceParamClassifier();

        classifier.addParameter({
            exposure: 10,
            bin: 1,
        });
        classifier.addParameter({
            exposure: 20,
            bin: 1,
        });


        assert.deepStrictEqual(classifier.extractParameters(), [
            {exposure: 10},
            {exposure: 20},
        ]);
    });

    it("Classify sequence parameters in order", ()=> {
        const classifier = new SequenceParamClassifier();

        classifier.addParameter({
            exposure: 10,
            bin: 1,
            filter: "red",
        });
        classifier.addParameter({
            exposure: 10,
            bin: 1,
            filter: "green",
        });
        classifier.addParameter({
            exposure: 20,
            bin: 1,
            filter: "green",
        });

        assert.deepStrictEqual(classifier.extractParameters(), [
            {filter: "red", exposure: 10},
            {filter: "green", exposure: 10},
            {exposure: 20},
        ]);
    });
});