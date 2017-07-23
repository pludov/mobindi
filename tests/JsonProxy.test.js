/**
 * Created by ludovic on 21/07/17.
 */

test("Util function", function(assert) {
    assert.ok(has({e: null}, 'e'), "has function with null value");

});
test("Serial updates", function(assert) {

    var changeTracker = new JsonProxy();
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

});


test("Serial updates with object childs", function(assert) {
    var changeTracker = new JsonProxy();
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

test("Serial updates with array childs", function(assert) {
    var changeTracker = new JsonProxy();
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


function checkConst(obj) {
    var json = JSON.stringify(obj);
    return {
        value: json,
        unchanged: function(assert) {
            console.log('compare:\n  ' + JSON.stringify(obj) + '\n  ' + json);
            return JSON.stringify(obj) == json;
        }
    };
}

test("Streaming replication", function(assert) {
    var changeTracker = new JsonProxy();
    var root = changeTracker.getTarget();

    var fork = changeTracker.fork();

    var data = fork.data;
    var serial = fork.serial;
    console.log('starting serial =' + JSON.stringify(serial));

    var previousData = checkConst(data);
    var patches = changeTracker.diff(serial);
    assert.deepEqual(patches, undefined, "No change => no patch");



    STEP = "prop creation of final value";

    root.a="toto";
    patches = changeTracker.diff(serial);
    assert.deepEqual(patches, {update: {a: "toto"}}, "Patch for " + STEP);
    assert.deepEqual(serial, changeTracker.takeSerialSnapshot(), "Serial update on diff for " + STEP);

    data = applyDiff(data, patches);
    assert.deepEqual(data, root, "Patch apply for " + STEP);
    assert.ok(previousData.unchanged(), "Patch return new instance for " + STEP);
    previousData = checkConst(data);


    STEP = "prop change of final value";

    root.a="toto2";
    patches = changeTracker.diff(serial);
    assert.deepEqual(patches, {update: {a: "toto2"}}, "Patch for " + STEP);
    assert.deepEqual(serial, changeTracker.takeSerialSnapshot(), "Serial update on diff for " + STEP);

    data = applyDiff(data, patches);
    assert.deepEqual(data, root, "Patch apply for " + STEP);

    assert.ok(previousData.unchanged(), "Patch return new instance for " + STEP);
    previousData = checkConst(data);



    STEP = "prop creation of object value";


    root.b = {};
    patches = changeTracker.diff(serial);
    assert.deepEqual(patches, {update: {b: {newObject: {}}}}, "Patch for " + STEP);
    assert.deepEqual(serial, changeTracker.takeSerialSnapshot(), "Serial update on diff for " + STEP);

    data = applyDiff(data, patches);
    assert.deepEqual(data, root, "Patch apply for " + STEP);

    assert.ok(previousData.unchanged(), "Patch return new instance for " + STEP);
    previousData = checkConst(data);


    STEP = "prop update in child";


    root.b.coucou = "coucou";
    patches = changeTracker.diff(serial);
    assert.deepEqual(patches, {update: {b: {update: {coucou: "coucou"}}}}, "Patch for " + STEP);
    assert.deepEqual(serial, changeTracker.takeSerialSnapshot(), "Serial update on diff for " + STEP);

    data = applyDiff(data, patches);
    assert.deepEqual(data, root, "Patch apply for " + STEP);

    assert.ok(previousData.unchanged(), "Patch return new instance for " + STEP);
    previousData = checkConst(data);



    STEP = "prop creation of null value";


    root.c = null;
    patches = changeTracker.diff(serial);
    assert.deepEqual(patches, {update: {c: null}}, "Patch for " + STEP);
    assert.deepEqual(serial, changeTracker.takeSerialSnapshot(), "Serial update on diff for " + STEP);

    data = applyDiff(data, patches);
    assert.deepEqual(data, root, "Patch apply for " + STEP);

    assert.ok(previousData.unchanged(), "Patch return new instance for " + STEP);
    previousData = checkConst(data);



    STEP = "array creation";

    root.d = ["a","b"];
    patches = changeTracker.diff(serial);
    assert.deepEqual(patches, {update: {d: {newArray: {0:"a", 1:"b"}}}}, "Patch for " + STEP);
    assert.deepEqual(serial, changeTracker.takeSerialSnapshot(), "Serial update on diff for " + STEP);

    data = applyDiff(data, patches);
    assert.deepEqual(data, root, "Patch apply for " + STEP);

    assert.ok(previousData.unchanged(), "Patch return new instance for " + STEP);
    previousData = checkConst(data);



    STEP = "prop delete";

    delete root.a;
    patches = changeTracker.diff(serial);
    assert.deepEqual(patches, {update: {}, delete: ['a']}, "Patch for " + STEP);
    assert.deepEqual(serial, changeTracker.takeSerialSnapshot(), "Serial update on diff for " + STEP);

    data = applyDiff(data, patches);
    assert.deepEqual(data, root, "Patch apply for " + STEP);

    assert.ok(previousData.unchanged(), "Patch return new instance for " + STEP);
    previousData = checkConst(data);



    STEP = "prop mutate to object";

    root.b.coucou = {truc: "bidule"};
    patches = changeTracker.diff(serial);
    assert.deepEqual(patches, {update: {b: { update: { coucou : { newObject: { truc: "bidule"}}}}}}, "Patch for " + STEP);
    assert.deepEqual(serial, changeTracker.takeSerialSnapshot(), "Serial update on diff for " + STEP);

    data = applyDiff(data, patches);
    assert.deepEqual(data, root, "Patch apply for " + STEP);

    assert.ok(previousData.unchanged(), "Patch return new instance for " + STEP);
    previousData = checkConst(data);


    STEP = "prop mutate to final";


    root.b.coucou = 3;
    patches = changeTracker.diff(serial);
    assert.deepEqual(patches, {update: {b: { update: { coucou : 3}}}}, "Patch for " + STEP);
    assert.deepEqual(serial, changeTracker.takeSerialSnapshot(), "Serial update on diff for " + STEP);

    data = applyDiff(data, patches);
    assert.deepEqual(data, root, "Patch apply for " + STEP);

    assert.ok(previousData.unchanged(), "Patch return new instance for " + STEP);
    previousData = checkConst(data);


});