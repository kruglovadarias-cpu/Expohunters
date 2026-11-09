import { test, expect } from '@playwright/test';

for (const viewport of [{ width: 1440, height: 835 }, { width: 390, height: 844 }]) {
  test(`меню закреплено на обоих экранах и остаётся рабочим — ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.locator('.feature').last()).toHaveCSS('opacity', '1');
    const header = page.locator('.header');
    const heroHeight = await page.locator('.hero').evaluate(el => (el as HTMLElement).offsetHeight);

    for (const top of [heroHeight * .45, heroHeight]) {
      await page.evaluate(top => scrollTo({ top, behavior: 'instant' }), top);
      await expect.poll(async () => (await header.boundingBox())!.y).toBeCloseTo(0, 1);
      await expect(header.getByRole('button', { name: /Рассчитать стенд/ })).toBeVisible();
    }

    const media = page.locator('.project-floating');
    await expect.poll(async () => (await media.boundingBox())!.width).toBeGreaterThan(viewport.width - 60);
    const bar = (await header.boundingBox())!;
    const video = (await media.boundingBox())!;
    expect(video.y).toBeGreaterThanOrEqual(bar.y + bar.height + 20);
    expect(video.y + video.height).toBeLessThanOrEqual(viewport.height - 12);

    await header.getByRole('button', { name: /Рассчитать стенд/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByLabel('Как к вам обращаться')).toBeFocused();
    await page.keyboard.press('Escape');
    if (viewport.width < 760) {
      await header.getByRole('button', { name: 'Открыть меню и контакты' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
    }
  });
}
