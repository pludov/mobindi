import { defineConfig } from '@playwright/test';

const port = process.env.E2E_PORT || '8099';

export default defineConfig({
    testDir: './tests',
    snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{arg}{ext}',
    workers: 1,
    globalTeardown: './global-teardown.js',
    retries: 0,
    timeout: 60000,
    reporter: [['list'], ['html', { open: 'never' }]],
    expect: {
        toHaveScreenshot: { maxDiffPixelRatio: 0.01, threshold: 0.2, animations: 'disabled', caret: 'hide' },
    },
    use: {
        baseURL: `http://localhost:${port}`,
        timezoneId: 'UTC',
        locale: 'en-US',
        deviceScaleFactor: 1,
        reducedMotion: 'reduce',
    },
    projects: [
        { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1024, height: 768 } } },
        { name: 'mobile', use: { browserName: 'chromium', viewport: { width: 390, height: 844 } } },
    ],
    webServer: {
        // Requires `npm run build` in root and ui/ beforehand
        command: 'node start-server.js',
        url: `http://localhost:${port}`,
        reuseExistingServer: false,
        timeout: 60000,
    },
});
