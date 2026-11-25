// Renders icons/icon.svg to the PNG sizes the manifest uses, and the small
// store promo tile, with headless Chrome. Run after changing the artwork:
//
//   node scripts/render-icons.mjs [path-to-chrome]
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME_PATHS = [
  process.argv[2],
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].filter(Boolean);
const chrome = CHROME_PATHS.find((p) => existsSync(p));
if (!chrome) throw new Error('Chrome not found; pass its path as the first argument');

const svgUrl = pathToFileURL(join(root, 'icons', 'icon.svg')).href;
const work = mkdtempSync(join(tmpdir(), 'mlf-icons-'));

function shoot(html, width, height, out) {
  const page = join(work, `page-${width}x${height}.html`);
  writeFileSync(page, `<!doctype html><html><body style="margin:0">${html}</body></html>`);
  execFileSync(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--default-background-color=00000000',
    `--window-size=${width},${height}`,
    `--screenshot=${out}`,
    pathToFileURL(page).href,
  ]);
}

for (const size of [16, 32, 48, 128]) {
  shoot(`<img src="${svgUrl}" width="${size}" height="${size}" style="display:block">`, size, size, join(root, 'icons', `icon${size}.png`));
}

shoot(
  `<div style="width:440px;height:280px;box-sizing:border-box;background:#FAEEDA;display:flex;align-items:center;gap:24px;padding:0 36px;font-family:'Segoe UI',system-ui,sans-serif;color:#412402">
     <img src="${svgUrl}" width="112" height="112">
     <div><div style="font-size:30px;font-weight:600;line-height:1.15">Marketplace<br>Declutter</div>
     <div style="margin-top:10px;font-size:16px;color:#633806">Only the listings near you.<br>Free · runs in your browser</div></div>
   </div>`,
  440,
  280,
  join(root, 'store', 'promo-small-440x280.png'),
);

rmSync(work, { recursive: true, force: true });
console.log('Rendered icons/icon{16,32,48,128}.png and store/promo-small-440x280.png');
