import "source-map-support/register";
import { expect, assert } from 'chai';
import 'mocha';

import JsonProxy, { SynchronizerTriggerCallback, TriggeredWildcard, NoWildcard } from './shared/JsonProxy';
import * as Obj from './shared/Obj';

class TestContext{
    checkEmptyPath: () => void;
    checkCallNumber: (delta: {[id:string]:number}) => void;
    checkCallbackCount: (listener: any, v: any) => void;
    performFlush: (title: any) => void;
    
    // Helper function
    constructor(changeTracker:JsonProxy<any>, numberOfCall:{[id:string]:number}) {
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

        var previousNumberOfCall = Obj.deepCopy(numberOfCall);

        function checkCallNumber(delta:{[id:string]:number}) {
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

        function checkCallbackCount(listener: SynchronizerTriggerCallback, v: string | number) {
            var installedCallbacks = changeTracker.synchronizerRoot.getInstalledCallbacks(listener);
            if (installedCallbacks.length != v) {
                console.error(STEP + ': Installed callback mismatch = ' + JSON.stringify(installedCallbacks));
            }
            assert.ok(installedCallbacks.length == v, STEP + ": " + v + " listeners are installed");
        }
        this.checkCallbackCount = checkCallbackCount.bind(this);

        function performFlush(title: string) {
            STEP = title;
            previousNumberOfCall = Object.assign({}, numberOfCall);
            changeTracker.flushSynchronizers();
            checkEmptyPath();
        }
        this.performFlush = performFlush.bind(this);
    }
}


describe("JsonProxySynchronizers", ()=>{
    it("Synchronize for root property", () => {

        var changeTracker = new JsonProxy<any>();
        var root = changeTracker.getTarget();

        var numberOfCall = {plop: 0};
        changeTracker.addSynchronizer(['plop'], function () {
                numberOfCall.plop++;
            },
            false);

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

    it("Synchronize for child property", ()=>{
        var changeTracker = new JsonProxy<any>();
        var root = changeTracker.getTarget();

        var numberOfCall = {plop: 0, secondPlop:0};
        changeTracker.addSynchronizer(['plop','a'], function () {
                numberOfCall.plop++;
            },
            false
        );

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
            },
            false
        );
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


    it("synchronizes with Wildcards", () => {
        var changeTracker = new JsonProxy<any>();
        var root = changeTracker.getTarget();

        root.plop = { child1: {c:10, d:11} };

        var numberOfCall = {plop: 0, troubleMaker:0};

        var troubleMakerListener = changeTracker.addSynchronizer(['plop', 'child2', 'a'], function() {
                numberOfCall.troubleMaker++;
            },
            false
        );

        var listener = changeTracker.addSynchronizer(['plop', null, [['a'], ['b']]], function () {
                numberOfCall.plop++;
            },
            false
        );

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

    it("synchronize removals under wildcards", ()=>{
        var changeTracker = new JsonProxy<any>();
        var root = changeTracker.getTarget();

        var numberOfCall = {plop: 0};

        var ctx = new TestContext(changeTracker, numberOfCall);

        var listener = changeTracker.addSynchronizer(['plop', null, [['a'], ['b']]], function () {
                numberOfCall.plop++;
            },
            false
        );

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

    it("synchronizes removal of two level wildcards", () => {
        var changeTracker = new JsonProxy<any>();
        var root = changeTracker.getTarget();


        var numberOfCall = {plop: 0};
        var ctx = new TestContext(changeTracker, numberOfCall);


        var listener = changeTracker.addSynchronizer(['plop', null, null, [['a'], ['b']]], function () {
                numberOfCall.plop++;
            },
            false
        );

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

    it("synchronizes with two listeners", ()=>{
        var changeTracker = new JsonProxy<any>();
        var root = changeTracker.getTarget();
        
        var numberOfCall = {total: 0, childs: 0, second: 0};
        
        var ctx = new TestContext(changeTracker, numberOfCall);
        
        root.child1 = {child2: {}};

        changeTracker.addSynchronizer(['child1','child2'], function () {
            numberOfCall.total++;
            numberOfCall.childs += (Object.keys(root.child1.child2)).length;
        }, true);

        changeTracker.addSynchronizer(['child1','child2'], function () {
            numberOfCall.second++;
        }, false);

        console.log('numberOfCall', JSON.stringify(numberOfCall, null, 2));

        ctx.checkCallNumber({total: 0, childs: 0, second: 0});
        
        ctx.performFlush('Initial flush');
        
        ctx.checkCallNumber({total: 1, childs: 0, second: 1});

        root.child1.child2.truc= 1;
        root.child1.child2.bidule= 2;

        ctx.performFlush('Second flush');
        
        ctx.checkCallNumber({total: 1, childs: 2, second: 1});
    });

    // A synchronizer should not be called when multiple change occurs
    it("collapses multiple changes", ()=>{
        var changeTracker = new JsonProxy<any>();
        var root = changeTracker.getTarget();

        var numberOfCall = {plop: 0, secondPlop:0};
        changeTracker.addSynchronizer(['plop',[['a'], ['b']]], function () {
                numberOfCall.plop++;
            },
            false
        );

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

    it("gives wildcard values on trigger",  ()=> {
        var changeTracker = new JsonProxy<any>();
        var root = changeTracker.getTarget();
        let triggered : TriggeredWildcard | undefined;

        changeTracker.addSynchronizer([ [ ['plop', null, 'machin'], ['truc'] ] ],
            (where:TriggeredWildcard)=> {
                console.log(where);
                triggered = where;
            },
            false,
            true
        );

        triggered = undefined;
        root.plop = {};
        root.plop.a= {machin: 1000};
        changeTracker.flushSynchronizers();
        assert.hasAllKeys(triggered, ['a'], 'one change');

        triggered = undefined;
        root.plop.b= {machin: 2000};
        changeTracker.flushSynchronizers();
        assert.hasAllKeys(triggered, ['b'], 'second change');

        triggered = undefined;
        root.plop.a.machin=3000;
        root.plop.b.machin=5000;
        changeTracker.flushSynchronizers();
        assert.hasAllKeys(triggered, ['a', 'b'], 'two changes');

        triggered = undefined;
        root.plop.a.machin=5000;
        root.plop.b.machin=7000;
        root.truc=10000;
        changeTracker.flushSynchronizers();
        assert.hasAllKeys(triggered, ['a', 'b', NoWildcard], 'three changes');

        triggered = undefined;
        delete root.plop.a;
        changeTracker.flushSynchronizers();
        assert.hasAllKeys(triggered, ['a'], 'one delete');

        triggered = undefined;
        delete root.plop.b;
        changeTracker.flushSynchronizers();
        assert.hasAllKeys(triggered, ['b'], 'second delete');

    });


    it("gives recursive wildcard values on trigger",  ()=> {
        var changeTracker = new JsonProxy<any>();
        var root = changeTracker.getTarget();
        let triggered : TriggeredWildcard | undefined;

        changeTracker.addSynchronizer([ [ ['devs', null, null, 'value' ] ] ],
            (where:TriggeredWildcard)=> {
                if (where === undefined) {
                    throw new Error("Triggered without wildcard !");
                }
                console.log(where);
                triggered = where;
            },
            false,
            true
        );

        triggered = undefined;
        root.devs = {};
        changeTracker.flushSynchronizers();
        assert.isUndefined(triggered);

        triggered = undefined;
        root.devs['a']= {};
        changeTracker.flushSynchronizers();
        assert.isUndefined(triggered);

        triggered = undefined;
        root.devs['a']['b'] = {};
        changeTracker.flushSynchronizers();
        assert.isUndefined(triggered);

        triggered = undefined;
        root.devs['a']['b'].value = "coucou";
        changeTracker.flushSynchronizers();
        assert.hasAllKeys(triggered, ['a']);
        assert.hasAllKeys(triggered!.a, ['b']);

        // Create a new device then add two properties
        triggered = undefined;
        root.devs['2'] = {c: {value: "c_value"} };
        root.devs['2']['d'] = {value: "d_value"};
        changeTracker.flushSynchronizers();
        assert.hasAllKeys(triggered, ['2']);
        assert.hasAllKeys(triggered!['2'], ['c', 'd']);

        // Delete all values
        triggered = undefined;
        delete root.devs['a']['b'].value;
        delete root.devs['2']['c'].value;
        changeTracker.flushSynchronizers();
        assert.hasAllKeys(triggered, ['2', 'a']);
        assert.hasAllKeys(triggered!['a'], ['b']);
        assert.hasAllKeys(triggered!['2'], ['c']);
    });



    it("remove synchronizer", () => {
        var changeTracker = new JsonProxy<any>();
        var root = changeTracker.getTarget();

        root.plop = { child1: {} };

        var numberOfCall = {keptListener: 0, removedListener:0};

        assert.ok(changeTracker.synchronizerRoot.isEmpty(), "Wildcard instancied on installation");

        var removedListener = changeTracker.addSynchronizer(['plop', null, 'c'], function() {
                numberOfCall.removedListener++;
            },
            false
        );
        var keptListener = changeTracker.addSynchronizer(['plop', null, 'd'], function() {
                numberOfCall.keptListener++;
            },
            false
        );

        assert.ok(numberOfCall.removedListener == 0, "No initial call");
        assert.ok(numberOfCall.keptListener == 0, "No initial call");

        root.plop.child1.c = 1;
        root.plop.child1.d = 1;
        changeTracker.flushSynchronizers();

        assert.ok(numberOfCall.removedListener == 1, "First call");
        assert.ok(numberOfCall.keptListener == 1, "First call");

        root.plop.child2 = {c : 1, d:1};
        changeTracker.flushSynchronizers();

        assert.ok(numberOfCall.removedListener == 2, "Wildcard call ok");
        assert.ok(numberOfCall.keptListener == 2, "Wildcard call ok");


        root.plop.child2.c++;
        root.plop.child2.d++;
        changeTracker.flushSynchronizers();

        assert.ok(numberOfCall.removedListener == 3, "Second wildcard call ok");
        assert.ok(numberOfCall.keptListener == 3, "Second wildcard call ok");

        root.plop.child1.c++;
        root.plop.child1.d++;

        changeTracker.removeSynchronizer(removedListener);

        changeTracker.flushSynchronizers();

        assert.ok(numberOfCall.removedListener == 3, "Synchronizer not called on removal");
        assert.ok(numberOfCall.keptListener == 4, "Kept synchronizer still called");


        root.plop.child4 = {c: 1, d:1};

        changeTracker.flushSynchronizers();

        assert.ok(numberOfCall.removedListener == 3, "Synchronizer not called on removal");
        assert.ok(numberOfCall.keptListener == 5, "Kept synchronizer still called");


        changeTracker.removeSynchronizer(keptListener);

        root.plop.child1.c++;
        root.plop.child1.d++;

        changeTracker.flushSynchronizers();

        assert.ok(numberOfCall.removedListener == 3, "Synchronizer still not called on removal");
        assert.ok(numberOfCall.keptListener == 5, "Last synchronizer not called");
        assert.ok(changeTracker.synchronizerRoot.isEmpty(), "Synchronizer clean");
    });
});
