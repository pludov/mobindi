'use strict';

const Obj = require('./Obj.js');
const fs = require('fs');
const tmp = require('tmp');

var configDir = 'local';

if (!fs.existsSync(configDir)){
    fs.mkdirSync(configDir);
}

class ConfigStore
{
    constructor(appStateManager, fileName, path, defaultContent, exampleContent)
    {
        this.appStateManager = appStateManager;
        
        this.saveRunning = false;
        this.saveMustRestart = false;

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
        this.fileName = fileName;
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

    startSave() {
        var self = this;
        var state = {};


        // Gives a delay to not save too often
        function start() {
            setTimeout(createTemp, 1000);
        }

        function createTemp() {
            tmp.file({dir: configDir, prefix: self.fileName, suffix: '.json'},
                function(err, path, fd, cleanupCallback) {
                    if (err) {
                        return onError(err);
                    }
                    state.tmpPath = path;
                    state.tmpFd = fd;
                    state.tmpCleanupCallback = cleanupCallback;
                    writeContent();
                });
        }

        function writeContent() {
            self.saveMustRestart = false;
            var buffer = new Buffer( JSON.stringify(self.lastPatch, null, 2), "utf8" );
            var position = 0;

            function writeMore() {
                fs.write(state.tmpFd, buffer, position, buffer.length - position,
                    function (err, bytesWritten) {
                        if (err) {
                            return onError(err);
                        }
                        if (bytesWritten == 0) {
                            return onError(new Error("Write failed"));
                        }
                        position += bytesWritten;
                        if (position < buffer.length) {
                            writeMore();
                        } else {
                            writeDone();
                        }
                    });
            }
            function writeDone() {
                syncFile();
            }

            if (buffer.length > 0) {
                writeMore();
            } else {
                writeDone();
            }
        }

        function syncFile()
        {
            fs.fsync(state.tmpFd, function(err) {
                if (err) {
                    return onError(err);
                }
                return closeFile();
            })
        }

        function closeFile()
        {
            fs.close(state.tmpFd, function(err) {
                state.tmpFd = undefined;
                if (err) {
                    return onError(err);
                }
                renameFile();
            });
        }

        function renameFile()
        {
            fs.rename(state.tmpPath, self.localPath, function(err) {
                if (err) {
                    return onError(err);
                }

                try {
                    state.tmpCleanupCallback();
                } catch(e) {}
                done();
            })
        }

        function onError(err) {
            console.error('Error saving ' + self.localPath, err);
            if (state.tmpCleanupCallback) {
                try {
                    state.tmpCleanupCallback();
                } catch(e) {}
            }
            state = {};
            self.saveMustRestart = true;

            done();
        }

        function done() {
            if (self.saveMustRestart) {
                console.log('save must restart for ' + self.localPath);
                state = {};
                return start();
            } else {
                self.saveRunning = false;
                console.log('Successfully saved ' + self.localPath);
            }
        }

        this.saveRunning = true;
        start();
    }

    saveLocal()
    {
        var newPatch = this.createPatch();
        if (newPatch === undefined) newPatch = {};
        if (!Obj.deepEqual(newPatch, this.lastPatch)) {
            console.log('should save : ' + JSON.stringify(newPatch, null, 2));
            this.lastPatch = Obj.deepCopy(newPatch);
            if (this.saveRunning) {
                this.saveMustRestart = true;
            } else {
                this.startSave();
            }
        }
    }

}

module.exports = ConfigStore;
