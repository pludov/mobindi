// Playwright may kill the webServer without letting it clean up: stop leftovers here
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

module.exports = async () => {
    const indiPort = process.env.E2E_INDI_PORT || '7699';
    spawnSync('pkill', ['-f', `^indiserver .* -p ${indiPort} `]);
    fs.rmSync(path.join(os.tmpdir(), 'mobindi-e2e-config'), { recursive: true, force: true });
};
