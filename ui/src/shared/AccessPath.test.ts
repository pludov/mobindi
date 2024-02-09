import { expect, assert } from 'chai';

import * as AccessPath from '../shared/AccessPath';

type Child = {
    c1: number;
    c2?: Root;
}

type Root = {
    a: Child,
    b: string
    c: Array<Child>;
    d: Child|null;
}

describe("AccessPath from Proxy", () => {

    it('get path for simplest case', () => {
        const accessor = AccessPath.For((r:Root)=>r.a);
        assert.deepEqual((accessor as any).path, ["a"], "path");
    });

    it('get multiple step path', () => {
        const accessor = AccessPath.For((r:Root)=>r.d!.c1);
        assert.deepEqual((accessor as any).path, ["d", "c1"], "path");
    });

    it('get array access path', () => {
        const accessor = AccessPath.For((r:Root)=>r.c[5].c1);
        assert.deepEqual((accessor as any).path, ["c", "5", "c1"], "path");
    });

    it('returns data', () => {
        const accessor = AccessPath.For((r:Root)=>r.a);

        let data: Root = {a: {c1: 5}, b: "toto", c:[], d: null};

        const v1 = accessor.access(data);
        assert.strictEqual(v1, data.a);
    });

    it('stop on missing prop', () => {
        const accessor = AccessPath.For((r:Root)=>r.c[2].c1);

        let data: Root = {a: {c1: 5}, b: "toto", c:[], d: null};

        const v1 = accessor.access(data);
        assert.strictEqual(v1, undefined);
    });

    it("does not return object properties", () => {
        const accessor = AccessPath.For((r:any)=>r.__proto__);

        let data: Root = {a: {c1: 5}, b: "toto", c:[], d: null};

        const v1 = accessor.access(data);
        assert.strictEqual(v1, undefined);
    });
});
