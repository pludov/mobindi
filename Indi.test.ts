import "source-map-support/register";
import { expect, assert } from 'chai';
import 'mocha';
import * as fs from 'fs';
import {promisify} from "util";

import JsonProxy from './shared/JsonProxy';
import {IndiConnection} from './Indi';
import { IndiDevice } from "./shared/BackOfficeStatus";


const readFile = promisify(fs.readFile);

describe("Indi", () => {
    it("converts json to xml", () => {

        const obj = {
            $$: 'defTextVector',
            "$device": "Telescope Simulator",
            "$name": "DRIVER_INFO",
            defText: [ {
                $name: "plop",
                $_: "text"
            }]
        };

        var xml = IndiConnection.toXml(obj);
        console.log('xml=' + xml);

        var rslt = undefined;
        new IndiConnection().newParser((e)=>{rslt = e}).write(xml);
        assert.deepEqual(obj, rslt, "Json => xml => json");
    });

    it("Does device state transitions", async () => {
        const data = await readFile('testdata/heq5-init.indi.json');

        var content = JSON.parse(data.toString());
        assert.ok(content.length > 0, "Got data");

        var appStateManager = new JsonProxy<{[deviceId:string]:IndiDevice}>();
        var indiConnection = new IndiConnection();
        indiConnection.deviceTree = appStateManager.getTarget();
        for(var i = 0 ; i < content.length; ++i) {
            indiConnection.onMessage(content[i]);
        }
        console.log('Resulting device tree is :\n' + JSON.stringify(appStateManager.getTarget(), null, 2));

        const expectedData = await readFile('testdata/heq5-init.devicetree.json');
        var expected = JSON.parse(expectedData.toString());
        assert.deepEqual(appStateManager.getTarget(), expected);
    });
});
