import "source-map-support/register";
import { expect, assert } from 'chai';
import * as util from 'util';
import 'mocha';

import JsonProxy, {has, WhiteList, mergeWhiteList, updateSnapshotWhitelist} from './shared/JsonProxy';

/**
 * Created by ludovic on 21/07/17.
 */
describe("Json proxy", () => {
    it("has function for null value", ()=> {
        assert.ok(has({e: null}, 'e'), "has function with null value");
    });
    it("updates serial", ()=> {
        var changeTracker = new JsonProxy<any>();
        var root = changeTracker.getTarget();


        assert.deepEqual(changeTracker.takeSerialSnapshot(), {serial: 0, childSerial: 0, props: {}}, "Serial start at 0");
        assert.deepEqual(root, {}, "Structure deepEquals to empty objecct");
        assert.equal(JSON.stringify(root), "{}", "stringify returns empty");

        assert.deepEqual(changeTracker.takeSerialSnapshot(), {serial: 0, childSerial: 0, props: {}}, "Serial don't auto inc (#1)");

        root.a = "toto";
        assert.equal(root.a, "toto", "Simple value set");

        assert.deepEqual(changeTracker.takeSerialSnapshot(), {serial: 0, childSerial: 1, props: {a: 1}}, "Serial move after new property");
        assert.deepEqual(changeTracker.takeSerialSnapshot(), {serial: 0, childSerial: 1, props: {a: 1}}, "Serial doesn't auto inc (#2)");

        root.a = "titi";
        assert.equal(root.a, "titi", "Simple value change");
        assert.deepEqual(changeTracker.takeSerialSnapshot(), {serial: 0, childSerial: 2, props: {a: 2}}, "Serial moves after value change");


        var error;
        try {
            root.b = undefined;
        } catch(e) {
            error = e;
        }
        assert.ok(error != undefined, "Undefined must be rejected");
        assert.deepEqual(changeTracker.takeSerialSnapshot(), {serial: 0, childSerial: 2, props: {a: 2}}, "Serial not modified on rejection");

        delete root.a;
        assert.equal(root.a, undefined, "Removed property returns undefined");
        assert.ok(!('a' in root), "Removed property not 'in'");
        assert.deepEqual(root, {}, "Structure reflect property removal");

        assert.deepEqual(changeTracker.takeSerialSnapshot(), {serial: 0, childSerial: 3, props: {}}, "Deletion is visible via child serial");

    });

    it("keeps serial on primitive no-op assignment", ()=> {
        for(const value of ["toto", 1, null, true]) {
            var changeTracker = new JsonProxy<any>();
            var root = changeTracker.getTarget();

            assert.deepEqual(changeTracker.takeSerialSnapshot(), {serial: 0, childSerial: 0, props: {}}, "Serial start at 0");
            assert.deepEqual(root, {}, "Structure deepEquals to empty objecct");
            assert.equal(JSON.stringify(root), "{}", "stringify returns empty");

            assert.deepEqual(changeTracker.takeSerialSnapshot(), {serial: 0, childSerial: 0, props: {}}, "Serial don't auto inc (#1)");

            root.a = value;
            assert.equal(root.a, value, "Simple value set to " + JSON.stringify(value));

            assert.deepEqual(changeTracker.takeSerialSnapshot(), {serial: 0, childSerial: 1, props: {a: 1}}, "Serial move after new property");
            assert.deepEqual(changeTracker.takeSerialSnapshot(), {serial: 0, childSerial: 1, props: {a: 1}}, "Serial doesn't auto inc (#2)");

            root.a = value;
            assert.equal(root.a, value, "Simple value still set to " +  JSON.stringify(value));
            assert.deepEqual(changeTracker.takeSerialSnapshot(), {serial: 0, childSerial: 1, props: {a: 1}}, "No serial change on no-op assignement (string)");

            delete root.a;
            assert.equal(root.a, undefined, "Removed property returns undefined");
            assert.ok(!('a' in root), "Removed property not 'in'");
            assert.deepEqual(root, {}, "Structure reflect property removal");
        }
    });


    it("updates serial of object childs", ()=>{
        var changeTracker = new JsonProxy<any>();
        var root = changeTracker.getTarget();

        assert.deepEqual(changeTracker.takeSerialSnapshot(), {serial: 0, childSerial: 0, props: {}}, "Serial start at 0");
        root.a = "toto"
        root.child = {value:"122"};

        assert.deepEqual(root, {a: "toto", child: {value: "122"}}, "Structure reflects changes");
        assert.deepEqual(JSON.parse(JSON.stringify(root)), root, "stringify works with child");
        assert.deepEqual(changeTracker.takeSerialSnapshot(),
            {
                serial: 0,
                childSerial: 1,
                props: {
                    a: 1,
                    child: {
                        serial: 1,
                        childSerial: 1,
                        props: {
                            value: 1
                        }
                    }
                }
            }, "Serial updated on child add");

        // Now change a value in child
        root.child.value=55;
        assert.deepEqual(root, {a: "toto", child: {value: 55}}, "Structure reflects changes");
        assert.deepEqual(JSON.parse(JSON.stringify(root)), root, "stringify works with changed child");
        assert.deepEqual(changeTracker.takeSerialSnapshot(),
            {
                serial: 0,
                childSerial: 2,
                props: {
                    a: 1,
                    child: {
                        serial: 1,
                        childSerial: 2,
                        props: {
                            value: 2
                        }
                    }
                }
            }, "Serial updated on child change");


    });

    it("Updates serial of array childs", () => {
        var changeTracker = new JsonProxy<any>();
        var root = changeTracker.getTarget();

        assert.deepEqual(changeTracker.takeSerialSnapshot(), {serial: 0, childSerial: 0, props: {}}, "Serial start at 0");
        root.a = "toto"
        root.child = [{value:"1"}];

        assert.deepEqual(root, {a: "toto", child: [{value: "1"}]}, "Structure reflects changes");
        assert.deepEqual(JSON.parse(JSON.stringify(root)), root, "stringify works with child");

        assert.deepEqual(changeTracker.takeSerialSnapshot(),
            {
                serial: 0,
                childSerial: 1,
                props:
                    {
                        a: 1,
                        child: {
                            serial: 1,
                            childSerial: 1,
                            props: {
                                "0": {
                                    serial: 1,
                                    childSerial: 1,
                                    props: {
                                        value: 1
                                    }
                                }
                            }
                        }
                    }
            }, "Serial updated on child add");

        // Now change a value in child
        root.child[0].value=2;
        assert.deepEqual(root, {a: "toto", child: [{value: 2}]}, "Structure reflects changes");
        assert.deepEqual(JSON.parse(JSON.stringify(root)), root, "stringify works with changed child");
        assert.deepEqual(changeTracker.takeSerialSnapshot(),
            {
                serial: 0,
                childSerial: 2,
                props:
                    {
                        a: 1,
                        child: {
                            serial: 1,
                            childSerial: 2,
                            props: {
                                "0": {
                                    serial: 1,
                                    childSerial: 2,
                                    props: {
                                        value: 2
                                    }
                                }
                            }
                        }
                    }
            }, "Serial updated on child update");

        // Add a new child
        root.child.push({value: 3});
        assert.deepEqual(root, {a: "toto", child: [{value: 2}, {value:3}]}, "Structure reflects changes");
        assert.deepEqual(JSON.parse(JSON.stringify(root)), root, "stringify works with changed child");
        assert.deepEqual(changeTracker.takeSerialSnapshot(),
            {
                serial: 0,
                childSerial: 3,
                props:
                    {
                        a: 1,
                        child: {
                            serial: 1,
                            childSerial: 3,
                            props: {
                                "0": {
                                    serial: 1,
                                    childSerial: 2,
                                    props: {
                                        value: 2
                                    }
                                },
                                "1": {
                                    serial: 3,
                                    childSerial: 3,
                                    props: {
                                        value: 3
                                    }
                                }
                            }
                        }
                    }
            }, "Serial updated on child push");

        // Insert a child
        root.child.splice(0,0, {item: "atstart"});
        assert.deepEqual(root, {a: "toto", child: [{item: "atstart"}, {value: 2}, {value:3}]}, "Structure reflects changes");
        assert.deepEqual(JSON.parse(JSON.stringify(root)), root, "stringify works with inserted child");
        assert.deepEqual(changeTracker.takeSerialSnapshot(),
            {
                serial: 0,
                childSerial: 4,
                props:
                    {
                        a: 1,
                        child: {
                            serial: 1,
                            childSerial: 4,
                            props: {
                                "0": {
                                    serial: 1,
                                    childSerial: 4,
                                    props: {
                                        item: 4
                                    }
                                },
                                "1": {
                                    serial: 3,
                                    childSerial: 4,
                                    props: {
                                        value: 4
                                    }
                                },
                                "2": {
                                    serial: 4,
                                    childSerial: 4,
                                    props: {
                                        value: 4
                                    }
                                }
                            }
                        }
                    }
            }, "Serial updated on child slice");

        // Delete then create a node (serial will be wrong)
    });


    function checkConst(obj:any) {
        var json = JSON.stringify(obj);
        return {
            value: json,
            unchanged: function() {
                console.log('compare:\n  ' + JSON.stringify(obj) + '\n  ' + json);
                return JSON.stringify(obj) == json;
            }
        };
    }

    it('performs streaming replication', ()=>{
        var changeTracker = new JsonProxy<any>();
        var root = changeTracker.getTarget();

        var fork = changeTracker.fork();

        var data = fork.data;
        var serial = fork.serial;
        console.log('starting serial =' + JSON.stringify(serial));

        var previousData = checkConst(data);
        var patches: any = changeTracker.diff(serial);
        assert.deepEqual(patches, undefined, "No change => no patch");



        let STEP = "prop creation of final value";

        root.a="toto";
        patches = changeTracker.diff(serial);
        assert.deepEqual(patches, {update: {a: "toto"}}, "Patch for " + STEP);
        assert.deepEqual(serial, changeTracker.takeSerialSnapshot(), "Serial update on diff for " + STEP);

        data = JsonProxy.applyDiff(data, patches);
        assert.deepEqual(data, root, "Patch apply for " + STEP);
        assert.ok(previousData.unchanged(), "Patch return new instance for " + STEP);
        previousData = checkConst(data);


        STEP = "prop change of final value";

        root.a="toto2";
        patches = changeTracker.diff(serial);
        assert.deepEqual(patches, {update: {a: "toto2"}}, "Patch for " + STEP);
        assert.deepEqual(serial, changeTracker.takeSerialSnapshot(), "Serial update on diff for " + STEP);

        data = JsonProxy.applyDiff(data, patches);
        assert.deepEqual(data, root, "Patch apply for " + STEP);

        assert.ok(previousData.unchanged(), "Patch return new instance for " + STEP);
        previousData = checkConst(data);



        STEP = "prop creation of object value";


        root.b = {};
        patches = changeTracker.diff(serial);
        assert.deepEqual(patches, {update: {b: {newObject: {}}}}, "Patch for " + STEP);
        assert.deepEqual(serial, changeTracker.takeSerialSnapshot(), "Serial update on diff for " + STEP);

        data = JsonProxy.applyDiff(data, patches);
        assert.deepEqual(data, root, "Patch apply for " + STEP);

        assert.ok(previousData.unchanged(), "Patch return new instance for " + STEP);
        previousData = checkConst(data);


        STEP = "prop update in child";


        root.b.coucou = "coucou";
        patches = changeTracker.diff(serial);
        assert.deepEqual(patches, {update: {b: {update: {coucou: "coucou"}}}}, "Patch for " + STEP);
        assert.deepEqual(serial, changeTracker.takeSerialSnapshot(), "Serial update on diff for " + STEP);

        data = JsonProxy.applyDiff(data, patches);
        assert.deepEqual(data, root, "Patch apply for " + STEP);

        assert.ok(previousData.unchanged(), "Patch return new instance for " + STEP);
        previousData = checkConst(data);



        STEP = "prop creation of null value";


        root.c = null;
        patches = changeTracker.diff(serial);
        assert.deepEqual(patches, {update: {c: null}}, "Patch for " + STEP);
        assert.deepEqual(serial, changeTracker.takeSerialSnapshot(), "Serial update on diff for " + STEP);

        data = JsonProxy.applyDiff(data, patches);
        assert.deepEqual(data, root, "Patch apply for " + STEP);

        assert.ok(previousData.unchanged(), "Patch return new instance for " + STEP);
        previousData = checkConst(data);



        STEP = "array creation";

        root.d = ["a","b"];
        patches = changeTracker.diff(serial);
        assert.deepEqual(patches, {update: {d: {newArray: {0:"a", 1:"b"}}}}, "Patch for " + STEP);
        assert.deepEqual(serial, changeTracker.takeSerialSnapshot(), "Serial update on diff for " + STEP);

        data = JsonProxy.applyDiff(data, patches);
        assert.deepEqual(data, root, "Patch apply for " + STEP);

        assert.ok(previousData.unchanged(), "Patch return new instance for " + STEP);
        previousData = checkConst(data);


        STEP = "array splice";

        root.d.splice(0, 1);
        patches = changeTracker.diff(serial);
        assert.deepEqual(patches, {update: {d: {update: {0:"b"}, delete: ["1"]}}}, "Patch for " + STEP);
        assert.deepEqual(serial, changeTracker.takeSerialSnapshot(), "Serial update on diff for " + STEP);

        data = JsonProxy.applyDiff(data, patches);
        assert.deepEqual(data, root, "Patch apply for " + STEP);

        assert.ok(previousData.unchanged(), "Patch return new instance for " + STEP);
        previousData = checkConst(data);

        STEP = "array insert";

        root.d.splice(0, 0, "a is back");
        patches = changeTracker.diff(serial);
        assert.deepEqual(patches, {update: {d: {update: {0:"a is back", 1:"b"}}}}, "Patch for " + STEP);
        assert.deepEqual(serial, changeTracker.takeSerialSnapshot(), "Serial update on diff for " + STEP);

        data = JsonProxy.applyDiff(data, patches);
        assert.deepEqual(data, root, "Patch apply for " + STEP);

        assert.ok(previousData.unchanged(), "Patch return new instance for " + STEP);
        previousData = checkConst(data);


        STEP = "array push (init)";
        root.e = ['first'];
        patches = changeTracker.diff(serial);
        assert.deepEqual(patches, {update: {e: {newArray: {0:"first"}}}}, "Patch for " + STEP);
        assert.deepEqual(serial, changeTracker.takeSerialSnapshot(), "Serial update on diff for " + STEP);

        data = JsonProxy.applyDiff(data, patches);
        assert.deepEqual(data, root, "Patch apply for " + STEP);

        assert.ok(previousData.unchanged(), "Patch return new instance for " + STEP);
        previousData = checkConst(data);

        STEP = "array push (push)";
        root.e.push('second');
        patches = changeTracker.diff(serial);
        assert.deepEqual(patches, {update: {e: {update: {1:"second"}}}}, "Patch for " + STEP);
        assert.deepEqual(serial, changeTracker.takeSerialSnapshot(), "Serial update on diff for " + STEP);

        data = JsonProxy.applyDiff(data, patches);
        assert.deepEqual(data, root, "Patch apply for " + STEP);

        assert.ok(previousData.unchanged(), "Patch return new instance for " + STEP);
        previousData = checkConst(data);


        STEP = "array replace";
        root.f = [ null, null, null ];
        patches = changeTracker.diff(serial);
        assert.deepEqual(patches, {update: {f: {newArray: {0: null, 1: null, 2:null}}}}, "Patch for " + STEP);
        assert.deepEqual(serial, changeTracker.takeSerialSnapshot(), "Serial update on diff for " + STEP);

        data = JsonProxy.applyDiff(data, patches);
        assert.deepEqual(data, root, "Patch apply for " + STEP);

        assert.ok(previousData.unchanged(), "Patch return new instance for " + STEP);
        previousData = checkConst(data);


        root.f = [ null, null ];
        patches = changeTracker.diff(serial);
        assert.deepEqual(patches, {update: {f: {delete: ["2"], update: {}}}}, "Patch for " + STEP);
        assert.deepEqual(serial, changeTracker.takeSerialSnapshot(), "Serial update on diff for " + STEP);

        data = JsonProxy.applyDiff(data, patches);
        assert.deepEqual(data, root, "Patch apply for " + STEP);

        assert.ok(previousData.unchanged(), "Patch return new instance for " + STEP);
        previousData = checkConst(data);




        STEP = "prop delete";

        delete root.a;
        patches = changeTracker.diff(serial);
        assert.deepEqual(patches, {update: {}, delete: ['a']}, "Patch for " + STEP);
        assert.deepEqual(serial, changeTracker.takeSerialSnapshot(), "Serial update on diff for " + STEP);

        data = JsonProxy.applyDiff(data, patches);
        assert.deepEqual(data, root, "Patch apply for " + STEP);

        assert.ok(previousData.unchanged(), "Patch return new instance for " + STEP);
        previousData = checkConst(data);



        STEP = "prop mutate to object";

        root.b.coucou = {truc: {machin: "bidule"}};
        patches = changeTracker.diff(serial);
        assert.deepEqual(patches, {update: {b: { update: { coucou : { newObject: { truc: {newObject: { machin: "bidule"}}}}}}}}, "Patch for " + STEP);
        assert.deepEqual(serial, changeTracker.takeSerialSnapshot(), "Serial update on diff for " + STEP);

        data = JsonProxy.applyDiff(data, patches);
        assert.deepEqual(data, root, "Patch apply for " + STEP);

        assert.ok(previousData.unchanged(), "Patch return new instance for " + STEP);
        previousData = checkConst(data);


        STEP = "prop mutate to final";


        root.b.coucou = 3;
        patches = changeTracker.diff(serial);
        assert.deepEqual(patches, {update: {b: { update: { coucou : 3}}}}, "Patch for " + STEP);
        assert.deepEqual(serial, changeTracker.takeSerialSnapshot(), "Serial update on diff for " + STEP);

        data = JsonProxy.applyDiff(data, patches);
        assert.deepEqual(data, root, "Patch apply for " + STEP);

        assert.ok(previousData.unchanged(), "Patch return new instance for " + STEP);
        previousData = checkConst(data);


        STEP = "prop mutate to boolean";

        root.b.coucou = true;
        patches = changeTracker.diff(serial);
        assert.deepEqual(patches, {update: {b: { update: { coucou : true}}}}, "Patch for " + STEP);
        assert.deepEqual(serial, changeTracker.takeSerialSnapshot(), "Serial update on diff for " + STEP);

        data = JsonProxy.applyDiff(data, patches);
        assert.deepEqual(data, root, "Patch apply for " + STEP);

        assert.ok(previousData.unchanged(), "Patch return new instance for " + STEP);
        previousData = checkConst(data);

    });


    it('performs partial streaming replication', ()=>{

        const whiteList: WhiteList = { props: { a: true } };
        
        function whiteListedClone(e:any) {
            if (! Object.prototype.hasOwnProperty.call(e, "a")) {
                return {};
            }
            return {a: e.a};
        }

        var changeTracker = new JsonProxy<any>();
        var root = changeTracker.getTarget();

        root.outOfWhiteList = {really: true};

        var fork = changeTracker.fork(whiteList);

        var data = fork.data;
        var serial = fork.serial;
        console.log('starting serial =' + JSON.stringify(serial));
        assert.deepStrictEqual(data, whiteListedClone(data), "Initial data filtered according to whiteList");


        var previousData = checkConst(data);
        var patches: any = changeTracker.diff(serial, whiteList);
        assert.deepEqual(patches, undefined, "No change => no patch");


        let STEP = "ignore change out of whitelist";
        root.other = "bing";
        patches = changeTracker.diff(serial, whiteList);
        assert.deepStrictEqual(patches, undefined, "Ignore direct out of tree changes");
        assert.deepEqual(serial, changeTracker.takeSerialSnapshot(whiteList), "Unchanged serial after out of tree change");


        STEP = "prop creation of final value";

        root.a="toto";
        patches = changeTracker.diff(serial, whiteList);
        assert.deepEqual(patches, {update: {a: "toto"}}, "Patch for " + STEP);
        assert.deepEqual(serial, changeTracker.takeSerialSnapshot(whiteList), "Serial update on diff for " + STEP);

        data = JsonProxy.applyDiff(data, patches);
        // FIXME: filter for white list
        assert.deepEqual(data, whiteListedClone(root), "Patch apply for " + STEP);
        assert.ok(previousData.unchanged(), "Patch return new instance for " + STEP);


        previousData = checkConst(data);


        STEP = "prop change of final value";

        root.a="toto2";
        patches = changeTracker.diff(serial, whiteList);
        assert.deepEqual(patches, {update: {a: "toto2"}}, "Patch for " + STEP);
        assert.deepEqual(serial, changeTracker.takeSerialSnapshot(whiteList), "Serial update on diff for " + STEP);

        data = JsonProxy.applyDiff(data, patches);
        assert.deepEqual(data, whiteListedClone(root), "Patch apply for " + STEP);

        assert.ok(previousData.unchanged(), "Patch return new instance for " + STEP);
        previousData = checkConst(data);



        STEP = "whitelist removal";
        
        delete root.a;
        patches = changeTracker.diff(serial, whiteList);
        assert.deepEqual(patches, {update: {}, delete: ['a']}, "Patch for " + STEP);
        assert.deepEqual(serial, changeTracker.takeSerialSnapshot(whiteList), "Serial update on diff for " + STEP);

        data = JsonProxy.applyDiff(data, patches);
        assert.deepEqual(data, whiteListedClone(root), "Patch apply for " + STEP);

        assert.ok(previousData.unchanged(), "Patch return new instance for " + STEP);
        previousData = checkConst(data);
    });

    it('includes newly-whitelisted path even if only unrelated changes happened since snapshot', ()=> {
        const initialWhiteList: WhiteList = { props: { stable: true } };
        const expandedWhiteList: WhiteList = { props: { stable: true, missing: true } };

        const changeTracker = new JsonProxy<any>();
        const root = changeTracker.getTarget();
        root.stable = { value: 1 };
        root.missing = { payload: { deep: 42 } };
        root.unrelated = { counter: 0 };

        const { serial } = changeTracker.fork(initialWhiteList);

        // Mutations happened, but only on a branch unrelated to the newly-whitelisted path.
        root.unrelated.counter = 1;
        root.unrelated.extra = true;

        updateSnapshotWhitelist(serial, initialWhiteList, expandedWhiteList);

        const patch = changeTracker.diff(serial, expandedWhiteList);
        const expectedPatch: any = {
            update: {
                missing: {
                    newObject: {
                        payload: {
                            newObject: {
                                deep: 42,
                            },
                        },
                    },
                },
            },
        };
        assert.deepEqual(
            patch,
            expectedPatch,
            'Expanding whitelist must push current value of newly-included path'
        );
    });

    describe('updateSnapshotWhitelist', ()=> {
        it('clears root childSerial when root whitelist changes', ()=> {
            const initialWhiteList: WhiteList = { props: { only: true } };
            const expandedWhiteList: WhiteList = { props: { only: true, added: true } };

            const tracker = new JsonProxy<any>();
            const root = tracker.getTarget();
            root.only = 1;
            root.added = 2;

            const { serial } = tracker.fork(initialWhiteList);
            assert.notStrictEqual(serial.childSerial, undefined, 'precondition: childSerial initially set');

            updateSnapshotWhitelist(serial, initialWhiteList, expandedWhiteList);

            assert.strictEqual(serial.childSerial, undefined, 'root childSerial is cleared');
        });

        it('clears childSerial from changed nested path up to root', ()=> {
            const oldWhiteList: WhiteList = {
                props: {
                    top: {
                        props: {
                            child: {
                                wildcard: true,
                                props: {
                                    target: false,
                                },
                            },
                        },
                    },
                },
            };
            const newWhiteList: WhiteList = {
                props: {
                    top: {
                        props: {
                            child: {
                                wildcard: true,
                                props: {
                                    target: true,
                                },
                            },
                        },
                    },
                },
            };

            const tracker = new JsonProxy<any>();
            const root = tracker.getTarget();
            root.top = { child: { target: { deep: 9 }, other: 1 } };

            const { serial } = tracker.fork(oldWhiteList);
            const topSnapshot: any = serial.props.top;
            const childSnapshot: any = topSnapshot.props.child;
            assert.notStrictEqual(serial.childSerial, undefined, 'precondition: root childSerial initially set');
            assert.notStrictEqual(topSnapshot.childSerial, undefined, 'precondition: top childSerial initially set');
            assert.notStrictEqual(childSnapshot.childSerial, undefined, 'precondition: child childSerial initially set');

            updateSnapshotWhitelist(serial, oldWhiteList, newWhiteList);

            assert.strictEqual(serial.childSerial, undefined, 'root childSerial cleared');
            assert.strictEqual(topSnapshot.childSerial, undefined, 'ancestor childSerial cleared');
            assert.strictEqual(childSnapshot.childSerial, undefined, 'changed node childSerial cleared');
        });
    });


    it('inspect/stringify correctly', ()=>{
        function initObj(obj:any) {
            obj.a = "bonjour";
            obj.b = {bChild:"truc"};
            obj.c = ["a",2, "c"];
            obj.c[1]++;
            obj.c[2]={coucou:1};
            obj.d={};
            obj.d=false;
        }

        const changeTracker = new JsonProxy<any>();
        const root = changeTracker.getTarget();
        initObj(root);

        const reference = {};
        initObj(reference);

        assert.strictEqual(util.inspect(root), util.inspect(reference), "Proxy not visible through util.inspect");
        assert.strictEqual(JSON.stringify(root), JSON.stringify(reference), "Proxy not visible through JSON.stringify");
    });

    describe("WhiteList wildcard", () => {
        it("wildcard fallback in whiteListChild via fork", () => {
            const tracker = new JsonProxy<any>();
            const root = tracker.getTarget();
            root.keep = { x: 1 };
            root.also = { y: 2 };
            root.skip = { z: 3 };

            const wl: WhiteList = {
                wildcard: true,
                props: { skip: false },
            };

            const { data } = tracker.fork(wl);
            assert.deepEqual(data.keep, { x: 1 }, "wildcard includes unlisted key 'keep'");
            assert.deepEqual(data.also, { y: 2 }, "wildcard includes unlisted key 'also'");
            assert.strictEqual(data.skip, undefined, "explicit false excludes 'skip'");
        });

        it("wildcard fallback in diff", () => {
            const tracker = new JsonProxy<any>();
            const root = tracker.getTarget();
            root.a = 1;
            root.b = 2;

            const wl: WhiteList = { wildcard: true, props: { b: false } };
            const { serial } = tracker.fork(wl);

            root.a = 10;
            root.b = 20;
            const patch = tracker.diff(serial, wl);
            assert.deepEqual(patch, { update: { a: 10 } }, "wildcard propagates 'a'; 'b' is excluded");
        });

        it("named key overrides wildcard", () => {
            const tracker = new JsonProxy<any>();
            const root = tracker.getTarget();
            root.named = 1;
            root.other = 2;

            const wl: WhiteList = { props: { named: true } };
            const { data } = tracker.fork(wl);
            assert.strictEqual(data.named, 1, "explicit true overrides wildcard=false");
            assert.strictEqual(data.other, undefined, "wildcard=false (absent) excludes unlisted key");
        });

        it("nested wildcard excludes deep heavy fields", () => {
            const tracker = new JsonProxy<any>();
            const root = tracker.getTarget();
            root.sequences = {
                byuuid: {
                    seq1: { title: "T1", images: [1, 2, 3] },
                    seq2: { title: "T2", images: [4, 5] },
                }
            };

            const wl: WhiteList = {
                props: {
                    sequences: {
                        props: {
                            byuuid: {
                                wildcard: { wildcard: true, props: { images: false } },
                            }
                        }
                    }
                }
            };

            const { data } = tracker.fork(wl);
            assert.strictEqual(data.sequences.byuuid.seq1.title, "T1", "title included via nested wildcard");
            assert.strictEqual(data.sequences.byuuid.seq1.images, undefined, "images excluded by nested explicit false");
            assert.strictEqual(data.sequences.byuuid.seq2.title, "T2", "second sequence title included");
            assert.strictEqual(data.sequences.byuuid.seq2.images, undefined, "second sequence images excluded");
        });
    });

    describe("mergeWhiteList", () => {
        it("undefined (include-all) wins over anything", () => {
            const wl: WhiteList = { props: { a: true } };
            assert.strictEqual(mergeWhiteList(undefined, wl), undefined, "undefined + object => undefined");
            assert.strictEqual(mergeWhiteList(wl, undefined), undefined, "object + undefined => undefined");
            assert.strictEqual(mergeWhiteList(undefined, undefined), undefined, "undefined + undefined => undefined");
        });

        it("both empty => empty (exclude all)", () => {
            const result = mergeWhiteList({}, {});
            assert.deepEqual(result, {}, "empty + empty => empty");
        });

        it("union of non-overlapping keys", () => {
            const a: WhiteList = { props: { x: true } };
            const b: WhiteList = { props: { y: true } };
            const result = mergeWhiteList(a, b);
            const tracker = new JsonProxy<any>();
            const root = tracker.getTarget();
            root.x = 1; root.y = 2; root.z = 3;
            const { data } = tracker.fork(result);
            assert.strictEqual(data.x, 1, "x from a");
            assert.strictEqual(data.y, 2, "y from b");
            assert.strictEqual(data.z, undefined, "z in neither");
        });

        it("permissive wins: one excludes, other includes", () => {
            const a: WhiteList = { props: { key: false } };
            const b: WhiteList = { props: { key: true } };
            const result = mergeWhiteList(a, b)!;
            const tracker = new JsonProxy<any>();
            const root = tracker.getTarget();
            root.key = 42;
            const { data } = tracker.fork(result);
            assert.strictEqual(data.key, 42, "include wins over exclude");
        });

        it("wildcard from one side propagates to unnamed keys", () => {
            const a: WhiteList = { props: { named: true } };
            const b: WhiteList = { wildcard: true };
            const result = mergeWhiteList(a, b)!;
            const tracker = new JsonProxy<any>();
            const root = tracker.getTarget();
            root.named = 1; root.other = 2;
            const { data } = tracker.fork(result);
            assert.strictEqual(data.named, 1, "named key included");
            assert.strictEqual(data.other, 2, "unnamed key included via b's wildcard");
        });

        it("merged wildcards: both false => excluded unnamed, any true => included", () => {
            const a: WhiteList = { wildcard: false };
            const b: WhiteList = { wildcard: false };
            const tracker = new JsonProxy<any>();
            const root = tracker.getTarget();
            root.x = 1;
            const res1 = mergeWhiteList(a, b)!;
            assert.strictEqual(tracker.fork(res1).data.x, undefined, "both wildcards=false => excluded");

            const c: WhiteList = { wildcard: true };
            const res2 = mergeWhiteList(a, c)!;
            assert.strictEqual(tracker.fork(res2).data.x, 1, "one wildcard=true => included");
        });

        it("dynamic merge: base excludes heavy fields, dynamic adds one sequence", () => {
            const base: WhiteList = {
                wildcard: true,
                props: {
                    sequences: {
                        props: {
                            list: true,
                            byuuid: {
                                wildcard: { wildcard: true, props: { images: false } },
                            }
                        }
                    }
                }
            };
            const dynamic: WhiteList = {
                props: {
                    sequences: {
                        props: {
                            byuuid: {
                                props: {
                                    seq1: { props: { images: true } }
                                }
                            }
                        }
                    }
                }
            };

            const merged = mergeWhiteList(base, dynamic)!;

            const tracker = new JsonProxy<any>();
            const root = tracker.getTarget();
            root.sequences = {
                list: ["seq1", "seq2"],
                byuuid: {
                    seq1: { title: "T1", images: [10, 11] },
                    seq2: { title: "T2", images: [20, 21] },
                }
            };

            const { data } = tracker.fork(merged);
            assert.deepEqual(data.sequences.list, ["seq1", "seq2"], "list always included");
            assert.strictEqual(data.sequences.byuuid.seq1.title, "T1", "seq1 title included");
            assert.deepEqual(data.sequences.byuuid.seq1.images, [10, 11], "seq1 images included via dynamic");
            assert.strictEqual(data.sequences.byuuid.seq2.title, "T2", "seq2 title included via wildcard");
            assert.strictEqual(data.sequences.byuuid.seq2.images, undefined, "seq2 images excluded (not in dynamic)");
        });
    });

});
