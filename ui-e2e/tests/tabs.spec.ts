import { test, expect, Page } from '@playwright/test';

// App ids as declared in ui/src/*App.tsx (getAppId)
const apps = ['camera', 'sequence', 'phd', 'focuser', 'astrometry', 'indiManager', 'toolExecuter', 'messages'];

// Selection to perform once a tab is shown, before taking its screenshot
const selections: { [app: string]: (page: Page) => Promise<void> } = {
    camera: async (page) => {
        const select = page.locator('.CameraView select').first();
        // Imaging setups appear once the simulators are known by the backend
        await expect(select.locator('option', { hasText: 'CCD Simulator' })).toBeEnabled();
        await select.selectOption({ label: 'CCD Simulator' });
        await expect(select.locator('option:checked')).toHaveText('CCD Simulator');
    },
    indiManager: async (page) => {
        await page.locator('.IndiDriverSelector select').selectOption({ label: 'CCD Simulator' });
    },
};

async function settle(page: Page) {
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
}

test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.AppStatusBar')).toBeVisible({ timeout: 30000 });
    // Let indi simulators connect
    await page.waitForTimeout(3000);
});

for (const app of apps) {
    test(`tab ${app}`, async ({ page }) => {
        const icon = page.getByTestId(`app-${app}`);
        await expect(icon).toBeVisible();
        await icon.click();
        await expect(icon).toHaveClass(/Active/);
        await selections[app]?.(page);
        await settle(page);
        await expect(page).toHaveScreenshot(`${app}.png`, {
            // Volatile parts (times, charts, notifications) are flagged with the e2e-ignore css class
            mask: [page.locator('.e2e-ignore')],
        });
    });
}
