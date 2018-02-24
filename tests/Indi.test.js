'use strict';

const fs = require('fs');
const JsonProxy = require('../JsonProxy');

test("Json to xml", function(assert) {

    const obj = {
        $$: 'defTextVector',
        "$device": "Telescope Simulator",
        "$name": "DRIVER_INFO",
        defText: [ {
            $name: "plop",
            $_: "text"
        }]
    };

    var xml = new IndiConnection().toXml(obj);
    console.log('xml=' + xml);

    var rslt = undefined;
    new IndiConnection().newParser((e)=>{rslt = e}).write(xml);
    assert.deepEqual(obj, rslt, "Json => xml => json");

});

test("Device state transitions", function(assert) {

    var done = assert.async();

    fs.readFile('tests/heq5-init.indi.json', function(error, data) {
        assert.ok(!error, "File read error: " + error);
        
        var content = JSON.parse(data);
        assert.ok(content.length > 0, "Got data");

        var appStateManager = new JsonProxy.JsonProxy();
        var indiConnection = new IndiConnection();
        indiConnection.deviceTree = appStateManager.getTarget();
        for(var i = 0 ; i < content.length; ++i) {
            indiConnection.onMessage(content[i]);
        }
        console.log('Resulting device tree is :\n' + JSON.stringify(appStateManager.getTarget(), null, 2));

        fs.readFile('tests/heq5-init.devicetree.json', function(error, data) {
            var expected = JSON.parse(data);
            assert.deepEqual(appStateManager.getTarget(), expected);
            done();
        });
    })
    console.log('ça marche!');
});