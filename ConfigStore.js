'use strict';

const Obj = require('./Obj.js');
const fs = require('fs');

var configDir = 'local';

if (!fs.existsSync(configDir)){
    fs.mkdirSync(configDir);
}

class ConfigStore
{
    constructor(appStateManager, fileName, path, defaultContent, exampleContent)
    {
        this.appStateManager = appStateManager;

        var target = appStateManager.getTarget();
        for(var i = 0; i < path.length; ++i) {
            if (!Object.prototype.hasOwnProperty.call(target, path[i])) {
                // Stay proxyed
                target[path[i]] = {};
            }
            target = target[path[i]];
        }
        Object.assign(target, defaultContent);
        this.currentContent = target;
        this.lastPatch = {};
        this.defaultContent = Obj.deepCopy(defaultContent);

        // load local config patch

        this.localPath = configDir + '/' + fileName + '.json';
        var examplePath = configDir + '/' + fileName + '.default.json';

        try {
            if (!fs.existsSync(examplePath)) {
                fs.writeFileSync(examplePath, JSON.stringify(exampleContent, null, 2));
            }
        } catch(e) {
            console.warn('Unable to save ' + examplePath, e);
        }
        
        try {
            if (!fs.existsSync(this.localPath)) {
                fs.writeFileSync(this.localPath, '{}', null, 2);
            }
        } catch(e) {
            console.warn('Unable to save ' + this.localPath, e);
        }
        
        try {
            var content = fs.readFileSync(this.localPath, 'utf8');
            var patch = JSON.parse(content);
            console.log('Loaded config patch: ' + JSON.stringify(patch, null, 2));
            Object.assign(this.currentContent, this.applyPatch(this.defaultContent, patch));
            console.log('Resulting config: ' + JSON.stringify(this.currentContent, null, 2));
            this.lastPatch = patch;
        } catch(e) {
            console.log('Unable to read local config : ', e);
        }

        // Save on change
        this.appStateManager.addSynchronizer(path, this.saveLocal.bind(this), false);
    }

    createPatch()
    {
        // Compare currentContent to defaultContent
        function canPatch(currentValue, defaultValue)
        {
            return Obj.isObject(currentValue) && Obj.isObject(defaultValue);
        }
        function compareObject(currentO, defaultO)
        {
            var result = {};
            for(var k of Object.keys(currentO))
            {
                if (!Object.prototype.hasOwnProperty.call(defaultO, k))
                {
                    result[k] = currentO[k];
                } else if (currentO[k] === defaultO[k]) {
                    continue;
                } else if (!(Obj.isObject(currentO[k]) && Obj.isObject(defaultO[k])))
                {
                    // Not an object on on side, can't merge
                    result[k] = currentO[k];
                } else {
                    // Two objects, can merge
                    var patch = compareObject(currentO[k], defaultO[k]);
                    if (patch !== undefined) {
                        result[k] = patch;
                    }
                }
            }
            var firstDel = true;
            for(var k of Object.keys(defaultO))
            {
                if (!Object.prototype.hasOwnProperty.call(defaultO, k))
                {
                    if (firstDel) {
                        result['$$removal$$'] = [];
                        firstDel = false;
                    }
                    result['$$removal$$'].push(k);
                }
            }
            if (Object.keys(result).length == 0) return undefined;
            return result;
        }

        return compareObject(this.currentContent, this.defaultContent);
    }

    applyPatch(defaultV, patchV)
    {
        if (!Obj.isObject(patchV)) {
            return patchV;
        }
        var result = {};
        for(var k of Object.keys(patchV)) {
            var wanted = patchV[k];
            // Recursive patch
            if (Obj.isObject(defaultV) && Object.prototype.hasOwnProperty.call(defaultV, k)) {
                wanted = this.applyPatch(defaultV[k], wanted);
            }
            result[k] = wanted;
        }
        if (Obj.isObject(defaultV)) {
            var removed = patchV['$$removal$$'] || [];
            for(var k of Object.keys(defaultV)) {
                if (!Object.prototype.hasOwnProperty.call(result, k) && removed.indexOf(k) == -1) {
                    result[k] = Obj.deepCopy(defaultV[k]);
                }
            }
        }
        return result;
    }

    saveLocal()
    {
        var newPatch = this.createPatch();
        if (newPatch === undefined) newPatch = {};
        if (!Obj.deepEqual(newPatch, this.lastPatch)) {
            console.log('should save : ' + JSON.stringify(newPatch, null, 2));
        }
    }

}

module.exports = ConfigStore;
