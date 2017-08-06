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

test("Synchronizer application for root property", function(assert) {

    var changeTracker = new JsonProxy();
    var root = changeTracker.getTarget();

    var numberOfCall = {plop: 0};
    changeTracker.addSynchronizer(['plop'], function () {
        numberOfCall.plop++;
    });

    assert.ok(numberOfCall.plop == 0, "No initial call");

    changeTracker.flushSynchronizers();

    assert.ok(numberOfCall.plop == 0, "No call on flush");

    changeTracker.flushSynchronizers();

    assert.ok(numberOfCall.plop == 0, "No change => no call");

    root.zoubida = 'alpha';
    changeTracker.flushSynchronizers();

    assert.ok(numberOfCall.plop == 0, "Unrelated change => no call");

    root.plop = 'tralala';
    changeTracker.flushSynchronizers();
    assert.ok(numberOfCall.plop == 1, "Related change => call");

    root.plop = null;
    changeTracker.flushSynchronizers();
    assert.ok(numberOfCall.plop == 2, "Set to null => call");

    delete root.plop;
    changeTracker.flushSynchronizers();
    assert.ok(numberOfCall.plop == 3, "Delete => call");



});

test("Synchronizer application for child property", function(assert) {
    var changeTracker = new JsonProxy();
    var root = changeTracker.getTarget();

    var numberOfCall = {plop: 0, secondPlop:0};
    changeTracker.addSynchronizer(['plop','a'], function () {
        numberOfCall.plop++;
    });

    assert.ok(numberOfCall.plop == 0, "No initial call");

    changeTracker.flushSynchronizers();

    assert.ok(numberOfCall.plop == 0, "No call on flush");

    changeTracker.flushSynchronizers();

    assert.ok(numberOfCall.plop == 0, "No change => no call");

    root.zoubida = 'alpha';
    changeTracker.flushSynchronizers();

    assert.ok(numberOfCall.plop == 0, "Unrelated change => no call");

    root.plop = 'tralala';
    changeTracker.flushSynchronizers();
    assert.ok(numberOfCall.plop == 0, "Parent changed to string => no call");

    root.plop = null;
    changeTracker.flushSynchronizers();
    assert.ok(numberOfCall.plop == 0, "Parent changed to null => no call");

    root.plop = {};
    changeTracker.flushSynchronizers();
    assert.ok(numberOfCall.plop == 0, "Parent changed to object => no call");

    root.plop.a = "coucou";
    changeTracker.flushSynchronizers();
    assert.ok(numberOfCall.plop == 1, "Property set => call");

    root.plop.a = {};
    changeTracker.flushSynchronizers();
    assert.ok(numberOfCall.plop == 2, "Property changed to object => call");


    root.plop.a.bouzouf = "1";
    changeTracker.flushSynchronizers();
    assert.ok(numberOfCall.plop == 3, "Property added to object => call");

    root.plop.a.constructor = {};
    changeTracker.flushSynchronizers();
    assert.ok(numberOfCall.plop == 4, "Object Property added to object => call");

    // Attach to existing node
    changeTracker.addSynchronizer(['plop','a'], function () {
        numberOfCall.secondPlop++;
    });
    changeTracker.flushSynchronizers();
    assert.ok(numberOfCall.secondPlop == 0, "new synchronizer added => no initial call");


    root.plop.a.constructor.truc= true;
    changeTracker.flushSynchronizers();
    assert.ok(numberOfCall.secondPlop == 1, "new synchronizer triggers on modification");
    assert.ok(numberOfCall.plop == 5, "first synchronizer still triggers on modification");


    delete root.plop;
    changeTracker.flushSynchronizers();
    assert.ok(numberOfCall.plop == 6, "Delete parent => call");


    root.truc = '';
    changeTracker.flushSynchronizers();
    assert.ok(numberOfCall.plop == 6, "Property does not exist => no call");

    root.plop= {a: 5};
    changeTracker.flushSynchronizers();
    assert.ok(numberOfCall.plop == 7, "Property reappear =>  call");

});


test("Wildcard synchronizer", function(assert) {
    var changeTracker = new JsonProxy();
    var root = changeTracker.getTarget();

    root.plop = { child1: {c:10, d:11} };

    var numberOfCall = {plop: 0, troubleMaker:0};

    var troubleMakerListener = changeTracker.addSynchronizer(['plop', 'child2', 'a'], function() {
        numberOfCall.troubleMaker++;
    });

    var listener = changeTracker.addSynchronizer(['plop', null, [['a'], ['b']]], function () {
        numberOfCall.plop++;
    });

    assert.ok(numberOfCall.plop == 0, "No initial call");
    assert.ok(changeTracker.synchronizerRoot.getInstalledCallbackCount(listener) == 2, "Wildcard instancied on installation");

    changeTracker.flushSynchronizers();
    assert.ok(numberOfCall.plop == 0, "No call on flush");

    changeTracker.flushSynchronizers();
    assert.ok(numberOfCall.plop == 0, "No change => no call");

    root.zoubida = 'alpha';
    changeTracker.flushSynchronizers();

    assert.ok(numberOfCall.plop == 0, "Unrelated change => no call");

    root.plop.child1.gzou = null;
    changeTracker.flushSynchronizers();
    assert.ok(numberOfCall.plop == 0, "Unrelated change in wildcarded branch (initial) => no call");

    root.plop.child1.a = 'bidule';
    root.plop.child1.b = 'truc';
    changeTracker.flushSynchronizers();
    assert.ok(numberOfCall.plop >= 1, "Change to wildcarded branch (initial) => call");
    assert.ok(numberOfCall.plop == 1, "Change to wildcarded branch (initial) => onecall");


    root.plop.child2 = {};
    changeTracker.flushSynchronizers();
    assert.ok(numberOfCall.plop == 1, "Wildcard got new child without prop => no call");
    assert.ok(changeTracker.synchronizerRoot.getInstalledCallbackCount(listener) == 4, "New node => Two more callback installed");

    root.plop.child2.a = 5;
    changeTracker.flushSynchronizers();
    assert.ok(numberOfCall.plop == 2, "Second node got value => call");

});


// A synchronizer should not be called when multiple change occurs
test("Collapse multiple change ", function(assert) {
    var changeTracker = new JsonProxy();
    var root = changeTracker.getTarget();

    var numberOfCall = {plop: 0, secondPlop:0};
    changeTracker.addSynchronizer(['plop',[['a'], ['b']]], function () {
        numberOfCall.plop++;
    });

    assert.ok(numberOfCall.plop == 0, "No initial call");

    changeTracker.flushSynchronizers();

    assert.ok(numberOfCall.plop == 0, "No call on flush");

    changeTracker.flushSynchronizers();

    assert.ok(numberOfCall.plop == 0, "No change => no call");

    root.zoubida = 'alpha';
    changeTracker.flushSynchronizers();

    assert.ok(numberOfCall.plop == 0, "Unrelated change => no call");

    root.plop = 'tralala';
    changeTracker.flushSynchronizers();
    assert.ok(numberOfCall.plop == 0, "Parent changed to string => no call");

    root.plop = null;
    changeTracker.flushSynchronizers();
    assert.ok(numberOfCall.plop == 0, "Parent changed to null => no call");

    root.plop = {};
    changeTracker.flushSynchronizers();
    assert.ok(numberOfCall.plop == 0, "Parent changed to object => no call");

    root.plop.a = "coucou";
    changeTracker.flushSynchronizers();
    assert.ok(numberOfCall.plop == 1, "Property set => call");

    root.plop.a = {};
    changeTracker.flushSynchronizers();
    assert.ok(numberOfCall.plop == 2, "Property changed to object => call");


    root.plop.a.bouzouf = "1";
    changeTracker.flushSynchronizers();
    assert.ok(numberOfCall.plop == 3, "Property added to object => call");

    root.plop.a.constructor = {};
    changeTracker.flushSynchronizers();
    assert.ok(numberOfCall.plop == 4, "Object Property added to object => call");


    root.plop.b = "bwasset";
    changeTracker.flushSynchronizers();
    assert.ok(numberOfCall.plop == 5, "Second property change => call");

    root.plop.a = "machin";
    root.plop.b = "truc";
    changeTracker.flushSynchronizers();
    assert.ok(numberOfCall.plop >= 6, "Two change => call");
    assert.ok(numberOfCall.plop == 6, "Two change => only one call");


    delete root.plop;
    changeTracker.flushSynchronizers();
    assert.ok(numberOfCall.plop >= 7, "Delete parent => call");
    assert.ok(numberOfCall.plop == 7, "Delete parent => only one call");

});