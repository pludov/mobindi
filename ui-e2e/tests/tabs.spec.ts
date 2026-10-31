import { test, expect, Page } from '@playwright/test';

// App ids as declared in ui/src/*App.tsx (getAppId)
const apps = ['camera', 'sequence', 'phd', 'focuser', 'astrometry', 'indiManager', 'toolExecuter', 'messages'];

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
        await settle(page);
        await expect(page).toHaveScreenshot(`${app}.png`, {
            // Volatile parts (times, charts, notifications) are flagged with the e2e-ignore css class
            mask: [page.locator('.e2e-ignore')],
        });
    });
}
