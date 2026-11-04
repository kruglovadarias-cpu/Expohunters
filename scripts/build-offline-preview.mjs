import { build } from 'vite';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Переносимая копия настоящего приложения: те же React-компоненты и WebGL.
// Видео, шрифты, логотипы, CSS и JavaScript встроены в один HTML.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = resolve(root, 'public');
const outputDir = resolve(root, 'dist-preview');
const archive = resolve(root, 'docs/expo-hunters-preview.zip');
const mime = { '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.mp4': 'video/mp4' };

async function dataUrl(relative) {
  const path = resolve(publicRoot, relative);
  if (!path.startsWith(publicRoot + sep)) throw new Error('Preview resource escaped public directory');
  const type = Object.entries(mime).find(([extension]) => path.endsWith(extension))?.[1];
  if (!type) throw new Error(`Unknown preview resource: ${relative}`);
  return `data:${type};base64,${(await readFile(path)).toString('base64')}`;
}

const logos = {};
for (const variant of ['dark', 'light']) {
  logos[variant] = {
    full: await dataUrl(`images/expo-hunters-${variant}.png`),
    small: await dataUrl(`images/expo-hunters-${variant}-small.png`),
  };
}
const configSource = await readFile(resolve(root, 'src/config.ts'), 'utf8');
const projectPattern = /projectVideo:\s*`\$\{import\.meta\.env\.BASE_URL\}([^`]+)`/;
const projectPath = configSource.match(projectPattern)?.[1];
if (!projectPath) throw new Error('Update the preview importer for the new video configuration');
const projectVideo = await dataUrl(projectPath);

const result = await build({
  root,
  configFile: resolve(root, 'vite.config.ts'),
  logLevel: 'warn',
  plugins: [{
    name: 'offline-preview-resources',
    enforce: 'pre',
    transform(code, id) {
      const path = id.split('?')[0];
      if (path === resolve(root, 'src/config.ts')) {
        return code.replace(projectPattern, `projectVideo: ${JSON.stringify(projectVideo)}`);
      }
      if (path === resolve(root, 'src/Logo.tsx')) {
        const src = 'src={`${base}.png`}';
        const srcSet = 'srcSet={`${base}-small.png 505w, ${base}.png 4034w`}';
        if (!code.includes(src) || !code.includes(srcSet)) throw new Error('Update the preview importer for the new logo component');
        return `const offlineLogos = ${JSON.stringify(logos)};\n` + code
          .replace(src, 'src={offlineLogos[variant].full}')
          .replace(srcSet, 'srcSet={`${offlineLogos[variant].small} 505w, ${offlineLogos[variant].full} 4034w`}');
      }
    },
  }],
  build: {
    write: false,
    cssCodeSplit: false,
    rolldownOptions: { output: { codeSplitting: false } },
  },
});

if (Array.isArray(result) || !('output' in result)) throw new Error('Unexpected Vite output');
const chunks = result.output.filter(file => file.type === 'chunk');
const javascript = chunks.find(file => file.isEntry);
if (chunks.length !== 1 || !javascript || javascript.imports.length || javascript.dynamicImports.length) {
  throw new Error('Offline preview requires a single bundled entry');
}
const cssFile = result.output.find(file => file.type === 'asset' && file.fileName.endsWith('.css'));
const htmlFile = result.output.find(file => file.type === 'asset' && file.fileName === 'index.html');
if (!cssFile || !htmlFile) throw new Error('Missing preview HTML or CSS');
let css = String(cssFile.source);
const fontUrls = [...css.matchAll(/url\((?:["'])?([^"')]+)(?:["'])?\)/g)];
for (const [expression, url] of fontUrls) {
  if (url.startsWith('data:')) continue;
  const relative = url.replace(/^(?:\.\.\/|\.\/|\/)+/, '');
  css = css.replace(expression, `url("${await dataUrl(relative)}")`);
}

let html = String(htmlFile.source);
const scriptTag = /<script\b[^>]*\bsrc=["'][^"']+["'][^>]*>\s*<\/script>/i;
const styleTag = /<link\b(?=[^>]*\brel=["']stylesheet["'])[^>]*>/i;
if (!scriptTag.test(html) || !styleTag.test(html)) throw new Error('Unexpected preview entry markup');
html = html.replace(scriptTag, () => `<script type="module">${javascript.code.replace(/<\/script/gi, '<\\/script')}</script>`);
html = html.replace(styleTag, () => `<style>${css}</style>`);
html = html.replace(/<link\b(?=[^>]*\brel=["']preload["'])[^>]*>/gi, '');
html = html.replace(/(<link\b[^>]*\brel=["']icon["'][^>]*\bhref=["'])[^"']+(["'])/i,
  `$1${await dataUrl('favicon.svg')}$2`);
const license = await readFile(resolve(publicRoot, 'fonts/OFL-Onest.txt'), 'utf8');
html = html.replace('</body>', `<script type="text/plain" id="onest-font-license">${license.replace(/<\/script/gi, '<\\/script')}</script>\n</body>`);
await mkdir(outputDir, { recursive: true });
await mkdir(dirname(archive), { recursive: true });
await writeFile(resolve(outputDir, 'index.html'), html);
await writeFile(resolve(root, 'docs/index.html'), html);

const instructions = `Expo Hunters — интерактивный просмотр\n\n1. Распакуйте архив.\n2. Откройте index.html в браузере Chrome на компьютере.\n3. Дождитесь появления элементов, двигайте мышью и прокрутите страницу вниз и обратно.\n\nВидео следует за мышью и деформируется как фотография в присланном примере, с интенсивностью 40% от предыдущей: 17,2 вместо 43. Миниатюра увеличена в 1,5 раза, на узких экранах вписывается в доступную ширину. Искажаются изображение и контур; края чёткие, без размытия и растушёвки. Перед хедером и кнопкой проекта рамка останавливается, над соцсетями движется свободно. При прокрутке тот же ролик плавно увеличивается во второй экран и продолжает играть. Круглая кнопка справа снизу ставит движение на паузу.\n\nЕсли эффекты отключены системной настройкой уменьшения движения или WebGL недоступен, отображается упрощённый вариант.\n\nИнтернет и установка программ не требуются. Форма только подготавливает письмо; отправка выполняется вашей почтовой программой.\n\nЭто снимок текущей версии сайта, а не автоматическая синхронизация с GitHub.\n`;
await writeFile(resolve(outputDir, 'Readme.txt'), instructions);
execFileSync('python3', ['-c', `
import sys,zipfile
from pathlib import Path
folder=Path(sys.argv[1]);archive=Path(sys.argv[2]);license=Path(sys.argv[3])
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 z.write(folder/'index.html','index.html')
 z.write(folder/'Readme.txt','Readme.txt')
 z.write(license,'OFL-Onest.txt')
with zipfile.ZipFile(archive) as z:
 assert z.testzip() is None,'Preview archive checksum error'
`, outputDir, archive, resolve(publicRoot, 'fonts/OFL-Onest.txt')]);
console.log(`Offline HTML: ${Math.round(Buffer.byteLength(html) / 1024)} KiB`);
console.log('Interactive preview saved to docs/expo-hunters-preview.zip');
