import { test, expect } from '@playwright/test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';

test('переносимый HTML не требует сети: шрифт, WebGL, курсор, скролл и форма', async ({ page, context }, testInfo) => {
  const requests: string[] = [];
  const errors: string[] = [];
  const observe = (target: typeof page) => {
    target.on('request', request => {
      if (/^https?:/.test(request.url())) requests.push(request.url().split('?')[0]);
    });
    target.on('pageerror', error => errors.push(error.message));
  };
  observe(page);
  await context.setOffline(true);
  const preview = fileURLToPath(new URL('../../dist-preview/index.html', import.meta.url));
  try {
    await page.goto(pathToFileURL(preview).href);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('ERR_BLOCKED_BY_ADMINISTRATOR')) throw error;
    // Управляемый Chromium запрещает file:. Настройки браузера не меняем;
    // проверяем те же байты документа в изолированной вкладке без сети.
    testInfo.annotations.push({ type: 'environment', description: 'file: blocked by browser policy; self-contained document tested through setContent' });
    await page.close();
    page = await context.newPage();
    observe(page);
    await page.setContent(await readFile(preview, 'utf8'));
  }
  await expect(page.locator('.intro')).toHaveCount(0);
  await expect(page.locator('.feature').last()).toHaveCSS('opacity', '1');
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('400 162px Onest', 'Выставочные стенды'))).toBe(true);
  expect(await page.locator('.brand .logo').evaluate(img => (img as HTMLImageElement).naturalWidth > 0)).toBe(true);
  expect(await page.locator('.project-photo').evaluate(img => (img as HTMLImageElement).naturalWidth)).toBe(1280);
  const image = page.locator('.project-floating');
  await expect(image).toHaveAttribute('data-liquid', 'ready');
  await page.mouse.move(400, 420);
  await expect.poll(async () => (await image.boundingBox())!.x).toBeLessThan(240);
  await page.mouse.move(1000, 400, { steps: 12 });
  await expect.poll(async () => (await image.boundingBox())!.x).toBeGreaterThan(650);
  const visiblePixels = await page.locator('canvas').evaluate(canvas => new Promise<boolean>(resolve => {
    requestAnimationFrame(() => {
      const gl = (canvas as HTMLCanvasElement).getContext('webgl')!;
      const pixel = new Uint8Array(4);
      gl.readPixels(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      resolve(pixel[3] > 0);
    });
  }));
  expect(visiblePixels).toBe(true);
  await page.evaluate(() => scrollTo({ top: document.querySelector('.hero')!.clientHeight, behavior: 'instant' }));
  await expect(image).toHaveAttribute('data-mode', 'scroll');
  await expect.poll(async () => (await image.boundingBox())!.width).toBeGreaterThan(1360);
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await expect(image).toHaveAttribute('data-mode', 'follow');
  await page.getByRole('button', { name: 'Остановить движение' }).click();
  await expect(page.getByRole('button', { name: 'Продолжить движение' })).toBeVisible();
  await page.getByRole('button', { name: 'ОБСУДИТЬ ПРОЕКТ', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('Как к вам обращаться').fill('Дарья');
  await page.getByLabel('Как с вами связаться').fill('test@example.com');
  await page.getByRole('button', { name: 'Подготовить письмо' }).click();
  await expect(page.getByRole('link', { name: 'Открыть письмо' })).toHaveAttribute('href', /^mailto:/);
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});
