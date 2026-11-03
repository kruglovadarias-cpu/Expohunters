import { test, expect, type Page } from '@playwright/test';

async function ready(page: Page) {
  await page.goto('/');
  await expect(page.locator('.intro')).toHaveCount(0);
  await expect(page.locator('.feature').last()).toHaveCSS('opacity', '1');
}

async function sampleImage(page: Page) {
  return page.locator('canvas').evaluate(canvas => new Promise<{ row: number[]; content: number[] }>(resolve => {
    requestAnimationFrame(() => {
      const gl = (canvas as HTMLCanvasElement).getContext('webgl')!;
      const pixels = new Uint8Array(canvas.width * 4);
      gl.readPixels(0, Math.floor(canvas.height / 2), canvas.width, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      const center = (Math.floor(canvas.width / 2) - 8) * 4;
      resolve({ row: Array.from(pixels), content: Array.from(pixels.slice(center, center + 16 * 4)) });
    });
  }));
}

test('оригинальный логотип, реальное видео и шрифт загружаются', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('400 162px Onest', 'ВЫСТАВОЧНЫЕ СТЕНДЫ'))).toBe(true);
  const logo = page.locator('.brand .logo');
  await expect(logo).toHaveAttribute('src', /expo-hunters-dark\.png$/);
  expect(await logo.evaluate(img => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0)).toBe(true);
  const original = await page.locator('video').evaluate(video => ({ w: video.videoWidth, h: video.videoHeight }));
  expect(original).toEqual({ w: 1280, h: 720 });
});

test('вступление, следование за курсором, жидкая деформация и обратимый переход при скролле', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('status', { name: 'Загрузка Expo Hunters' })).toBeVisible();
  await expect(page.locator('.intro')).toHaveCount(0);
  const image = page.locator('.project-floating');
  await expect(image).toHaveAttribute('data-liquid', 'ready');
  await expect(page.locator('.feature').last()).toHaveCSS('opacity', '1');
  await page.mouse.move(400, 420);
  await expect.poll(async () => (await image.boundingBox())!.x).toBeLessThan(240);
  await page.locator('video').evaluate(video => video.pause());
  await page.waitForTimeout(800);
  const rest = await sampleImage(page);
  expect(rest.row.some((value, index) => index % 4 === 3 && value > 0)).toBe(true);
  for (let x = 420; x <= 1000; x += 80) await page.mouse.move(x, 350 + (x % 160), { steps: 2 });
  const disturbed = await sampleImage(page);
  expect(disturbed.row).not.toEqual(rest.row);
  expect(disturbed.content).not.toEqual(rest.content);
  await expect.poll(async () => (await image.boundingBox())!.x).toBeGreaterThan(650);
  await page.locator('video').evaluate(video => video.play());
  await page.evaluate(() => scrollTo({ top: document.querySelector('.hero')!.clientHeight, behavior: 'instant' }));
  await expect(image).toHaveAttribute('data-mode', 'scroll');
  await expect.poll(async () => (await image.boundingBox())!.width).toBeGreaterThan(1360);
  // Сглаживание ещё может доводить рамку после достижения нужной ширины.
  await expect.poll(async () => (await image.boundingBox())!.x).toBeCloseTo(20, 0);
  await expect.poll(async () => (await image.boundingBox())!.y).toBeCloseTo(36, 0);
  await page.screenshot({ path: 'test-results/second-screen.png' });
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await expect(image).toHaveAttribute('data-mode', 'follow');
  await expect.poll(async () => (await image.boundingBox())!.width).toBeLessThan(400);
  await page.getByRole('button', { name: 'Остановить движение' }).click();
  await expect(page.getByRole('button', { name: 'Продолжить движение' })).toBeVisible();
  await page.screenshot({ path: 'test-results/first-screen.png' });
  expect(errors).toEqual([]);
});

test('бриф и контакты открываются, диалог закрывается с клавиатуры, почтовые ссылки корректны', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'ОБСУДИТЬ ПРОЕКТ', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByLabel('Как к вам обращаться')).toBeFocused();
  await page.getByLabel('Как к вам обращаться').fill('Дарья');
  await page.getByLabel('Как с вами связаться').fill('test@example.com');
  await page.getByLabel('Площадь стенда, м²').fill('48');
  await page.getByRole('button', { name: 'Подготовить письмо' }).click();
  await expect(page.getByRole('status')).toContainText('Письмо нужно отправить самостоятельно');
  const email = await page.getByRole('link', { name: 'Открыть письмо' }).getAttribute('href');
  expect(email).toMatch(/^mailto:hunter@expohunters.ru\?/);
  expect(decodeURIComponent(email!)).toContain('Имя: Дарья');
  expect(decodeURIComponent(email!)).toContain('Площадь: 48 м²');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button', { name: 'Контакты', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('link', { name: 'hunter@expohunters.ru' })).toHaveAttribute('href', 'mailto:hunter@expohunters.ru');
  await expect(page.getByRole('dialog').getByRole('link', { name: '+7 (495) 504-65-75' })).toHaveAttribute('href', 'tel:+74955046575');
});

test('кнопка паузы останавливает бегущую строку', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Остановить движение' }).click();
  await expect.poll(() => page.locator('video').evaluate(video => video.paused)).toBe(true);
  const track = page.locator('.marquee-track');
  await expect(page.getByRole('button', { name: 'Продолжить движение' })).toHaveAttribute('aria-pressed', 'true');
  const paused = await track.evaluate(el => getComputedStyle(el).transform);
  await page.waitForTimeout(300);
  expect(await track.evaluate(el => getComputedStyle(el).transform)).toBe(paused);
  await page.getByRole('button', { name: 'Продолжить движение' }).click();
  await expect(page.getByRole('button', { name: 'Остановить движение' })).toHaveAttribute('aria-pressed', 'false');
});

test('мобильный экран и reduced motion: без горизонтального скролла и без WebGL', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.getByRole('button', { name: 'Открыть меню и контакты' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.evaluate(() => document.querySelector('#projects')!.scrollIntoView());
  await expect(page.locator('video')).toBeInViewport();
  await expect(page.locator('video')).toHaveAttribute('controls', '');
  expect(await page.locator('video').evaluate(video => video.paused)).toBe(true);
  await page.screenshot({ path: 'test-results/mobile-second-screen.png' });
});

test.describe('сенсорный экран', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('картинка не требует курсора, свайп страницы переводит во второй экран', async ({ page }) => {
    await ready(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const image = page.locator('.project-floating');
    await expect(image).toBeInViewport();
    await expect(image).toHaveCSS('opacity', '1');
    await page.screenshot({ path: 'test-results/mobile-first-screen.png' });
    await page.evaluate(() => scrollTo({ top: document.querySelector('.hero')!.clientHeight, behavior: 'instant' }));
    await expect(image).toHaveAttribute('data-mode', 'scroll');
    await expect.poll(async () => (await image.boundingBox())!.width).toBeGreaterThan(350);
    await expect(image).toBeInViewport();
  });
});

test('при недоступном WebGL видео остаётся видимым и играет', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
      if (type === 'webgl') return null;
      return original.apply(this, [type, ...args] as never);
    } as typeof original;
  });
  await ready(page);
  const photo = page.locator('.project-video');
  await expect(photo).toBeVisible();
  await expect(photo).toHaveCSS('opacity', '1');
  expect(await photo.evaluate(video => (video as HTMLVideoElement).videoWidth)).toBeGreaterThan(0);
  await expect.poll(() => photo.evaluate(video => (video as HTMLVideoElement).currentTime)).toBeGreaterThan(.1);
});
