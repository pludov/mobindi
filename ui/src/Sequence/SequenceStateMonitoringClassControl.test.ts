import "source-map-support/register";
import { expect, assert } from 'chai';
import 'mocha';
import React from 'react';
import ReactDOM from 'react-dom';
import { exposureToString } from './SequenceStateMonitoringClassControl';

it('render exposure duration', () => {
    assert.equal(exposureToString(120), "120s");
    assert.equal(exposureToString(2), "2s");
    assert.equal(exposureToString(2.5), "2.5s");
    assert.equal(exposureToString(1), "1s");
    assert.equal(exposureToString(1.2), "1.2s");
    assert.equal(exposureToString(1.3), "1.3s");

    assert.equal(exposureToString(0.1), "0.1s");
    assert.equal(exposureToString(0.15), "150ms");
    assert.equal(exposureToString(0.95), "950ms");
    assert.equal(exposureToString(0.001), "1ms");
});
