// Starts the mobindi backend on a throw-away config dir seeded from fixtures/config
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const indiPort = process.env.E2E_INDI_PORT || '7699';
const configDir = path.join(os.tmpdir(), 'mobindi-e2e-config');
fs.rmSync(configDir, { recursive: true, force: true });
fs.mkdirSync(configDir, { recursive: true });
fs.cpSync(path.join(__dirname, 'fixtures', 'config'), configDir, { recursive: true });

// indiserver is detached from the backend: stop the one using our dedicated port (and its drivers)
function stopIndi() {
    spawnSync('pkill', ['-f', `^indiserver .* -p ${indiPort} `]);
}

stopIndi();

const child = spawn('node', ['dist/app.js'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, PORT: process.env.E2E_PORT || '8099', MOBINDI_CONFIG_DIR: configDir, MOBINDI_INDI_PORT: indiPort, NODE_ENV: 'prod' },
});

let cleaned = false;
function cleanup() {
    if (cleaned) return;
    cleaned = true;
    child.kill('SIGTERM');
    stopIndi();
    fs.rmSync(configDir, { recursive: true, force: true });
}
process.on('SIGTERM', () => { cleanup(); process.exit(0); });
process.on('SIGINT', () => { cleanup(); process.exit(0); });
process.on('exit', cleanup);
child.on('exit', (code) => { cleanup(); process.exit(code || 0); });
