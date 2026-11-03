import { test, expect, type Page } from '@playwright/test';

async function ready(page: Page) {
  await page.goto('/');
  await expect(page.locator('.feature').last()).toHaveCSS('opacity', '1');
  await expect(page.locator('.project-floating')).toHaveAttribute('data-liquid', 'ready');
  await expect.poll(() => page.locator('video').evaluate(video => video.currentTime)).toBeGreaterThan(.1);
}

test('плашка останавливается перед хедером, кнопкой проекта и соцсетями', async ({ page }) => {
  await ready(page);
  const panel = page.locator('.project-floating');
  for (const control of [page.locator('.project-cta'), page.locator('.socials > *').first(), page.locator('.header')]) {
    const target = (await control.boundingBox())!;
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 10 });
    await page.waitForTimeout(250);
    const frame = (await panel.boundingBox())!;
    const cta = (await page.locator('.project-cta').boundingBox())!;
    const header = (await page.locator('.header').boundingBox())!;
    expect(frame.y + frame.height).toBeLessThanOrEqual(cta.y - 20);
    expect(frame.y).toBeGreaterThanOrEqual(header.y + header.height + 20);
  }
  await page.getByRole('button', { name: 'ОБСУДИТЬ ПРОЕКТ', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('увеличение начинается сразу, идёт постепенно и сохраняет тот же играющий ролик', async ({ page }) => {
  await ready(page);
  const panel = page.locator('.project-floating');
  const video = page.locator('video');
  await video.evaluate(media => { media.dataset.instance = 'original'; });
  const before = await video.evaluate(media => media.currentTime);
  const initial = (await panel.boundingBox())!;
  await page.evaluate(() => scrollTo({ top: 60, behavior: 'instant' }));
  await page.waitForTimeout(180);
  const first = (await panel.boundingBox())!;
  expect(first.width).toBeGreaterThan(initial.width + 15);
  expect(first.width).toBeLessThan(initial.width + 110);
  let previous = first.width;
  for (const y of [160, 320, 520, 835]) {
    await page.evaluate(y => scrollTo({ top: y, behavior: 'instant' }), y);
    await page.waitForTimeout(250);
    const rect = (await panel.boundingBox())!;
    expect(rect.width).toBeGreaterThan(previous);
    expect(rect.y).toBeGreaterThanOrEqual(30);
    previous = rect.width;
    await expect(video).toHaveAttribute('data-instance', 'original');
  }
  await expect.poll(async () => (await panel.boundingBox())!.width).toBeGreaterThan(1395);
  await expect(panel).toHaveAttribute('data-liquid', 'idle');
  const playback = await video.evaluate(media => ({ time: media.currentTime, duration: media.duration, paused: media.paused }));
  expect((playback.time - before + playback.duration) % playback.duration).toBeGreaterThan(.2);
  expect(playback.paused).toBe(false);
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await expect(panel).toHaveAttribute('data-mode', 'follow');
  await expect.poll(async () => (await panel.boundingBox())!.width).toBeLessThan(400);
  await expect(video).toHaveAttribute('data-instance', 'original');
  await expect(page.locator('video')).toHaveCount(1);
});

test('30% деформации сохраняют сплошную читаемую видеоповерхность при резком движении', async ({ page }) => {
  await ready(page);
  await expect(page.locator('.project-floating')).toHaveAttribute('data-intensity', '30');
  for (const [x, y] of [[100, 120], [1300, 800], [200, 700], [1200, 150], [300, 500]]) {
    await page.mouse.move(x, y, { steps: 2 });
    await page.waitForTimeout(80);
  }
  const coverage = await page.locator('canvas').evaluate(canvas => new Promise<number>(resolve => {
    requestAnimationFrame(() => {
      const gl = (canvas as HTMLCanvasElement).getContext('webgl')!;
      const width = Math.floor(canvas.width * .6), height = Math.floor(canvas.height * .6);
      const pixels = new Uint8Array(width * height * 4);
      gl.readPixels(Math.floor((canvas.width - width) / 2), Math.floor((canvas.height - height) / 2), width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let opaque = 0;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 240) opaque++;
      resolve(opaque / (width * height));
    });
  }));
  expect(coverage).toBeGreaterThan(.99);
});
