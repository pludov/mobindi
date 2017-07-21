

test("Direct result propagation", function (assert) {

    var checked = false;
    new Cancelable((next, t)=>
    {
            assert.equal(t, 1, "Input argument provided");
            next.done(t + 1);
    })
        .then((rslt) => { checked = true; assert.equal(rslt, 2, "Direct result"); })
        .start(1);
    assert.ok(checked, "Direct execution");
});


test("Indirect result propagation", function (assert) {
    var done = assert.async();

    var checked = false;
    new Chain(
        new Sleep(1),
        new Cancelable((next, t)=>
        {
            assert.equal(t, 1, "Input argument provided");
            next.done(t + 1);
        })
    )
        .then((rslt) => { checked = true; assert.equal(rslt, 2, "Direct result"); })
        .start(1);

    assert.ok(!checked, "Indirect execution");

    setTimeout(() => {
       assert.ok(checked, "Chain terminated");
       done();
    }, 1000);
});