
// Helper function
function TestContext(assert, changeTracker, numberOfCall) {
    var STEP = 'init';

    function checkEmptyPath() {
        var emptyPath = changeTracker.synchronizerRoot.getEmptyPath();
        var id = emptyPath.indexOf('');
        if (id != -1) emptyPath.splice(id, 1);

        if (emptyPath.length) {
            console.error('Empty path found: ' + JSON.stringify(emptyPath));
        }
        assert.ok(emptyPath.length == 0, STEP + ":no empty path");
    }
    this.checkEmptyPath = checkEmptyPath.bind(this);

    var previousNumberOfCall = {};

    function checkCallNumber(delta) {
        for (var k of Object.keys(delta)) {
            var d = delta[k];
            if (d > 0) {
                assert.ok(numberOfCall[k] >= previousNumberOfCall[k] + d, STEP + ": at least " + d + " call to " + k);
                assert.ok(numberOfCall[k] == previousNumberOfCall[k] + d, STEP + ": exactly " + d + " call to " + k);
            } else {
                assert.ok(numberOfCall[k] == previousNumberOfCall[k] + d, STEP + ": " + d + " call to " + k);
            }
        }

    }
    this.checkCallNumber = checkCallNumber.bind(this);

    function checkCallbackCount(listener, v) {
        var installedCallbacks = changeTracker.synchronizerRoot.getInstalledCallbacks(listener);
        if (installedCallbacks.length != v) {
            console.error(STEP + ': Installed callback mismatch = ' + JSON.stringify(installedCallbacks));
        }
        assert.ok(installedCallbacks.length == v, STEP + ": " + v + " listeners are installed");
    }
    this.checkCallbackCount = checkCallbackCount.bind(this);

    function performFlush(title) {
        STEP = title;
        previousNumberOfCall = Object.assign({}, numberOfCall);
        changeTracker.flushSynchronizers();
        checkEmptyPath();
    }
    this.performFlush = performFlush.bind(this);
}

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

test("Wildcard synchronizer with removal", function(assert) {
    var changeTracker = new JsonProxy();
    var root = changeTracker.getTarget();

    var numberOfCall = {plop: 0};

    var ctx = new TestContext(assert, changeTracker, numberOfCall);

    var listener = changeTracker.addSynchronizer(['plop', null, [['a'], ['b']]], function () {
        numberOfCall.plop++;
    });

    assert.ok(numberOfCall.plop == 0, "No initial call");
    ctx.checkCallbackCount(listener, 0);

    ctx.performFlush('No change (initial)');
    ctx.checkCallNumber({plop : 0})

    ctx.performFlush('No change (subsequent)');
    ctx.checkCallNumber({plop : 0})

    root.zoubida = 'alpha';
    ctx.performFlush('Unrelated change at root');
    ctx.checkCallNumber({plop : 0});

    root.plop = {child1 : {gzou : 'hou!'}};
    ctx.performFlush('Creation of non matching wildcard child');
    ctx.checkCallNumber({plop : 0});
    ctx.checkCallbackCount(listener, 2);

    root.plop.child1.a = 'bidule';
    root.plop.child1.b = 'truc';
    ctx.performFlush('Matching properties appear in wildcard child');
    ctx.checkCallNumber({plop : 1});


    delete root.plop;
    ctx.performFlush('Removal of matching wildcard child');
    ctx.checkCallNumber({plop : 1});
    ctx.checkCallbackCount(listener, 0);

    root.plop = {child2: {a: 5}};
    ctx.performFlush('creation of child with props');
    ctx.checkCallNumber({plop : 1});
    ctx.checkCallbackCount(listener, 2);
});

test("Two level wildcard synchronizer with removal", function(assert) {
    var changeTracker = new JsonProxy();
    var root = changeTracker.getTarget();


    var numberOfCall = {plop: 0};
    var ctx = new TestContext(assert, changeTracker, numberOfCall);


    var listener = changeTracker.addSynchronizer(['plop', null, null, [['a'], ['b']]], function () {
        numberOfCall.plop++;
    });

    assert.ok(numberOfCall.plop == 0, "No initial call");
    ctx.checkCallbackCount(listener, 0);

    ctx.performFlush('No change (initial)');
    ctx.checkCallNumber({plop: 0})

    ctx.performFlush('No change (subsequent)');
    ctx.checkCallNumber({plop: 0})

    root.zoubida = 'alpha';
    ctx.performFlush('Unrelated change at root');
    ctx.checkCallNumber({plop: 0});

    root.plop = {child1: {}};
    ctx.performFlush('Creation of first level non matching wildcard child');
    ctx.checkCallNumber({plop: 0});
    ctx.checkCallbackCount(listener, 0);

    root.plop.child1.child2 = {gzou2: 'hou!'};
    ctx.performFlush('Creation of second level non matching wildcard child');
    ctx.checkCallNumber({plop: 0});
    ctx.checkCallbackCount(listener, 2);

    root.plop.child1.child2.a = 'bidule';
    root.plop.child1.child2.b = 'truc';
    ctx.performFlush('Matching properties appear in wildcard child');
    ctx.checkCallNumber({plop: 1});

    delete root.plop.child1.child2;
    ctx.performFlush('Removal of matching second level wildcard child');
    ctx.checkCallNumber({plop: 1});
    ctx.checkCallbackCount(listener, 0);

    delete root.plop.child1;
    ctx.performFlush('Removal of matching first level wildcard child');
    ctx.checkCallNumber({plop: 0});
    ctx.checkCallbackCount(listener, 0);
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

