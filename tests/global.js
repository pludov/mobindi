var testrunner = require("qunit");

testrunner.run({
    code: "Promises.js",
    tests: "tests/Promises.test.js"

});

testrunner.run({
    code: "JsonProxy.js",
    tests: "tests/JsonProxy.test.js"

});