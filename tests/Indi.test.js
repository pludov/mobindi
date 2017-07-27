

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

    rslt = undefined;
    new IndiConnection().newParser((e)=>{rslt = e}).write(xml);
    assert.deepEqual(obj, rslt, "Json => xml => json");

});