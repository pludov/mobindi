/**
 * Created by ludovic on 21/07/17.
 */


test("Serial updates", function(assert) {

    var changeTracker = new JsonProxy();
    var root = changeTracker.getTarget();



    assert.deepEqual(changeTracker.takeSerialSnapshot(), {"_$_serial_$_": 0, _$_created_$_: 0}, "Serial start at 0");

    assert.deepEqual(root, {}, "Structure not empty on start");
    assert.equal(JSON.stringify(root), "{}", "stringify does not work");

    assert.deepEqual(changeTracker.takeSerialSnapshot(), {"_$_serial_$_": 0, _$_created_$_: 0}, "Serial don't auto inc (#1)");

    root.a = "toto";
    assert.equal(root.a, "toto", "Simple value set");

    assert.deepEqual(changeTracker.takeSerialSnapshot(), {"_$_serial_$_": 1, _$_created_$_: 0}, "Serial moved at 1");
    assert.deepEqual(changeTracker.takeSerialSnapshot(), {"_$_serial_$_": 1, _$_created_$_: 0}, "Serial don't auto inc (#2)");

    var error;
    try {
        root.b = undefined;
    } catch(e) {
        error = e;
    }
    assert.ok(error != undefined, "Undefined was not rejected");
    assert.deepEqual(changeTracker.takeSerialSnapshot(), {"_$_serial_$_": 1, _$_created_$_: 0}, "Serial not modified on rejection");

});


test("Serial updates with object childs", function(assert) {
    var changeTracker = new JsonProxy();
    var root = changeTracker.getTarget();

    assert.deepEqual(changeTracker.takeSerialSnapshot(), {"_$_serial_$_": 0, _$_created_$_: 0}, "Serial start at 0");
    root.a = "toto"
    root.child = {value:"1"};

    assert.deepEqual(root, {a: "toto", child: {value: "1"}}, "Structure reflects changes");
    assert.deepEqual(JSON.parse(JSON.stringify(root)), root, "stringify works with child");
    assert.deepEqual(changeTracker.takeSerialSnapshot(),
        {
            "_$_serial_$_": 1,
            _$_created_$_: 0,
            child: {
                "_$_serial_$_": 1,
                _$_created_$_: 1
            }
        }, "Serial updated on child add");

    // Now change a value in child
    root.child.value=2;
    assert.deepEqual(root, {a: "toto", child: {value: 2}}, "Structure reflects changes");
    assert.deepEqual(JSON.parse(JSON.stringify(root)), root, "stringify works with changed child");
    assert.deepEqual(changeTracker.takeSerialSnapshot(),
        {
            "_$_serial_$_": 2,
            _$_created_$_: 0,
            child: {
                "_$_serial_$_": 2,
                _$_created_$_: 1
            }
        }, "Serial updated on child change");


});

test("Serial updates with array childs", function(assert) {
    var changeTracker = new JsonProxy();
    var root = changeTracker.getTarget();

    assert.deepEqual(changeTracker.takeSerialSnapshot(), {"_$_serial_$_": 0, "_$_created_$_" : 0}, "Serial start at 0");
    root.a = "toto"
    root.child = [{value:"1"}];

    assert.deepEqual(root, {a: "toto", child: [{value: "1"}]}, "Structure reflects changes");
    assert.deepEqual(JSON.parse(JSON.stringify(root)), root, "stringify works with child");
    assert.deepEqual(changeTracker.takeSerialSnapshot(),
        {
            "_$_serial_$_": 1,
            "_$_created_$_": 0,
            child:
                {
                    "_$_serial_$_": 1,
                    _$_created_$_: 1,
                    0: {
                        "_$_serial_$_": 1,
                        _$_created_$_: 1
                    }
                }
        }, "Serial updated on child add");

    // Now change a value in child
    root.child[0].value=2;
    assert.deepEqual(root, {a: "toto", child: [{value: 2}]}, "Structure reflects changes");
    assert.deepEqual(JSON.parse(JSON.stringify(root)), root, "stringify works with changed child");
    assert.deepEqual(changeTracker.takeSerialSnapshot(),
        {
            "_$_serial_$_": 2,
            _$_created_$_: 0,
            child: {
                "_$_serial_$_": 2,
                _$_created_$_: 1,
                0: {
                    "_$_serial_$_": 2,
                    _$_created_$_: 1,
                }
            }
        }, "Serial updated on child change");

    // Add a new child
    root.child.push({value: 3});
    assert.deepEqual(root, {a: "toto", child: [{value: 2}, {value:3}]}, "Structure reflects changes");
    assert.deepEqual(JSON.parse(JSON.stringify(root)), root, "stringify works with changed child");
    assert.deepEqual(changeTracker.takeSerialSnapshot(),
        {
            "_$_serial_$_": 3,
            _$_created_$_: 0,
            child: {
                "_$_serial_$_": 3,
                _$_created_$_: 1,
                0: {
                    "_$_serial_$_": 2,
                    _$_created_$_: 1
                },
                1: {
                    "_$_serial_$_": 1,
                    _$_created_$_: 3
                }
            }
        }, "Serial updated on child change");

    // Insert a child
    root.child.splice(0,0, {item: "atstart"});
    assert.deepEqual(root, {a: "toto", child: [{item: "atstart"}, {value: 2}, {value:3}]}, "Structure reflects changes");
    assert.deepEqual(JSON.parse(JSON.stringify(root)), root, "stringify works with inserted child");
    assert.deepEqual(changeTracker.takeSerialSnapshot(),
        {
            "_$_serial_$_": 4,
            _$_created_$_: 0,
            child: {
                "_$_serial_$_": 4,
                _$_created_$_: 1,
                0: {
                    "_$_serial_$_": 3,
                    _$_created_$_: 1
                },
                1: {
                    "_$_serial_$_": 2,
                    _$_created_$_: 3
                },
                2: {
                    "_$_serial_$_": 1,
                    _$_created_$_: 4
                }
            }
        }, "Serial updated on child change");

    // Delete then create a node (serial will be wrong)
});