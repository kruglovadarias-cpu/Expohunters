import { test, expect, type Page } from '@playwright/test';

async function ready(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.feature').last()).toHaveCSS('opacity', '1');
  await expect(page.locator('.project-floating')).toHaveAttribute('data-liquid', 'ready');
  await expect.poll(() => page.locator('video').evaluate(video => video.currentTime)).toBeGreaterThan(.1);
}

test('плашка защищает хедер и кнопку проекта, но свободно проходит над соцсетями', async ({ page }) => {
  await ready(page);
  const panel = page.locator('.project-floating');
  for (const control of [page.locator('.project-cta'), page.locator('.header')]) {
    const target = (await control.boundingBox())!;
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 10 });
    await page.waitForTimeout(250);
    const { frame, cta, header } = await page.evaluate(() => ({
      frame: document.querySelector('.project-floating')!.getBoundingClientRect().toJSON(),
      cta: document.querySelector('.project-cta')!.getBoundingClientRect().toJSON(),
      header: document.querySelector('.header')!.getBoundingClientRect().toJSON(),
    }));
    expect(frame.y + frame.height).toBeLessThanOrEqual(cta.y - 20);
    expect(frame.y).toBeGreaterThanOrEqual(header.y + header.height + 20);
  }
  const socials = (await page.locator('.socials > *').first().boundingBox())!;
  await page.mouse.move(socials.x + socials.width / 2, socials.y + socials.height / 2, { steps: 12 });
  await expect.poll(async () => { const rect = (await panel.boundingBox())!; return rect.y + rect.height; }).toBeGreaterThan(socials.y + socials.height);
  const free = (await panel.boundingBox())!;
  expect(free.y).toBeLessThan(socials.y);
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
  await expect(panel).toHaveAttribute('data-liquid', 'ready');
  const playback = await video.evaluate(media => ({ time: media.currentTime, duration: media.duration, paused: media.paused }));
  expect((playback.time - before + playback.duration) % playback.duration).toBeGreaterThan(.2);
  expect(playback.paused).toBe(false);
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await expect(panel).toHaveAttribute('data-mode', 'follow');
  await expect.poll(async () => (await panel.boundingBox())!.width).toBeCloseTo(552, 0);
  await expect(video).toHaveAttribute('data-instance', 'original');
  await expect(page.locator('video')).toHaveCount(1);
});

test('чёткие края без растушёвки и пустых кадров при увеличении и обратной прокрутке', async ({ page }) => {
  await ready(page);
  const result = await page.evaluate(() => new Promise<{ blank: number; samples: number; softPixels: number }>(resolve => {
    const video = document.querySelector('video')!;
    video.pause();
    const panel = document.querySelector<HTMLElement>('.project-floating')!;
    const canvas = document.querySelector('canvas')!;
    const gl = canvas.getContext('webgl')!;
    let blank = 0, samples = 0, softPixels = 0;
    const observer = new ResizeObserver(() => {
      // ResizeObserver выполняется после rAF и до paint: именно здесь старая
      // реализация очищала drawing buffer и показывала прозрачный кадр.
      const pixel = new Uint8Array(4);
      gl.readPixels(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      samples++;
      if (pixel[3] < 250) blank++;
      if (samples === 1) {
        const row = new Uint8Array(canvas.width * 4);
        gl.readPixels(0, Math.floor(canvas.height / 2), canvas.width, 1, gl.RGBA, gl.UNSIGNED_BYTE, row);
        for (let i = 3; i < row.length; i += 4) if (row[i] > 10 && row[i] < 245) softPixels++;
      }
    });
    observer.observe(panel);
    const start = performance.now();
    const heroHeight = document.querySelector<HTMLElement>('.hero')!.offsetHeight;
    const frame = (now: number) => {
      const p = Math.min(1, (now - start) / 3000);
      scrollTo({ top: heroHeight * (p <= .5 ? p * 2 : 2 - p * 2), behavior: 'instant' });
      if (p < 1) requestAnimationFrame(frame);
      else requestAnimationFrame(() => {
        observer.disconnect();
        resolve({ blank, samples, softPixels });
      });
    };
    requestAnimationFrame(frame);
  }));
  expect(result.samples).toBeGreaterThan(5);
  expect(result.blank).toBe(0);
  expect(result.softPixels).toBeLessThanOrEqual(4);
  await expect(page.locator('.project-floating')).toHaveAttribute('data-liquid', 'ready');
});

test('прежняя интенсивность сохраняет видимое видео при резком движении', async ({ page }) => {
  await ready(page);
  await expect(page.locator('.project-floating')).toHaveAttribute('data-intensity', '43');
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
