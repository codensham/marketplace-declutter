// Renders the Chrome Web Store screenshots (store/screenshot-{1,2,3}.png,
// 1280x800) and the README's popup image (docs/images/popup.png) with
// headless Chrome. The popup shown is the real popup.html, fed made-up
// counts through a stub of the chrome.* APIs. Run after changing the popup:
//
//   node scripts/render-store.mjs [path-to-chrome]
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, cpSync } from 'node:fs';
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

const work = mkdtempSync(join(tmpdir(), 'mlf-store-'));
for (const dir of ['lib', 'icons']) cpSync(join(root, dir), join(work, dir), { recursive: true });
cpSync(join(root, 'popup.js'), join(work, 'popup.js'));

// The popup with a stub in front of its scripts. The scene (settings, counts,
// which boxes are open) comes from the page's hash.
const STUB = `
const scene = JSON.parse(decodeURIComponent(location.hash.slice(1) || '{}'));
globalThis.chrome = {
  storage: {
    sync: { get: async () => ({ settings: scene.settings }), set: async () => {} },
    local: { get: async () => ({ fbLocation: { city: 'Springfield', state: 'IL', radiusMiles: 40 } }) },
    onChanged: { addListener() {} },
  },
  tabs: {
    query: async () => [{ id: 1, url: 'https://www.facebook.com/marketplace/' }],
    sendMessage: async () => ({ active: true, unknownSamples: [], farCities: [], ...scene.counts }),
  },
};
addEventListener('load', () => setTimeout(() => {
  if (scene.openFar) document.querySelector('#farCount button')?.click();
  if (scene.openWords) document.getElementById('editWords').click();
  document.activeElement?.blur();
}, 300));
`;
writeFileSync(join(work, 'stub.js'), STUB);
writeFileSync(
  join(work, 'popup.html'),
  readFileSync(join(root, 'popup.html'), 'utf8').replace(
    '<script src="lib/geo.js"></script>',
    '<script src="stub.js"></script><script src="lib/geo.js"></script>',
  ),
);

const counts = {
  hidden: 63, far: 24, ship: 11, ad: 5, price: 0, repeat: 14, word: 9, unknown: 2,
  farCities: [
    { label: 'Decatur, IL', count: 3, miles: 56 },
    { label: 'Bloomington, IL', count: 2, miles: 60 },
    { label: 'Peoria, IL', count: 4, miles: 66 },
    { label: 'Champaign, IL', count: 6, miles: 75 },
    { label: 'St. Louis, MO', count: 9, miles: 86 },
  ],
};
const popupUrl = (scene) =>
  `${pathToFileURL(join(work, 'popup.html')).href}#${encodeURIComponent(JSON.stringify({ counts, ...scene }))}`;

function shoot(html, width, height, out) {
  const page = join(work, 'page.html');
  writeFileSync(page, `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0">${html}</body></html>`);
  execFileSync(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--allow-file-access-from-files',
    '--blink-settings=preferredColorScheme=1', // light theme, whatever the system uses
    '--virtual-time-budget=4000',
    `--window-size=${width},${height}`,
    `--screenshot=${out}`,
    pathToFileURL(page).href,
  ]);
}

const logo = pathToFileURL(join(root, 'icons', 'icon.svg')).href;
const FONT = "font-family:'Segoe UI',system-ui,sans-serif;color:#1F2A1F";
const brand = `<div style="display:flex;align-items:center;gap:12px;font-size:21px;font-weight:600;color:#2F5D3A">
  <img src="${logo}" width="44" height="44">Marketplace Declutter</div>`;
// The popup scaled up so its text reads at store size.
const popup = (scene, height, scale = 1.3) => `<div style="width:${Math.round(340 * scale)}px;height:${Math.round(height * scale)}px;border-radius:18px;overflow:hidden;
  box-shadow:0 18px 50px rgba(31,42,31,.18);flex:none">
  <iframe src="${popupUrl(scene)}" style="width:340px;height:${height}px;border:0;transform:scale(${scale});transform-origin:0 0"></iframe></div>`;
const slide = (left, right) => `<div style="width:1280px;height:800px;box-sizing:border-box;background:#E9E5D6;
  display:flex;align-items:center;justify-content:space-between;gap:56px;padding:0 96px;${FONT}">
  <div style="max-width:560px">${left}</div>${right}</div>`;
const h = (text) => `<h1 style="margin:28px 0 22px;font-size:50px;line-height:1.1;font-weight:700">${text}</h1>`;
const p = (text) => `<p style="margin:0 0 14px;font-size:21px;line-height:1.45;color:#4A5546">${text}</p>`;
const bullets = (items) => `<ul style="margin:0 0 22px;padding:0;list-style:none;font-size:21px;line-height:1.35">${items
  .map((i) => `<li style="display:flex;gap:12px;margin-bottom:12px"><span style="color:#2F5D3A;font-weight:700">✓</span><span>${i}</span></li>`)
  .join('')}</ul>`;

shoot(
  slide(
    brand +
      h('Only the listings you can pick up') +
      bullets([
        'Listings outside your radius',
        'Shipping-only and eBay partner listings',
        'Duplicate listings Facebook repeats',
        'Seller ads',
        '"Wanted" and "ISO" posts, or keywords you add',
      ]) +
      p('Uses the location you already set on Marketplace. Free, and runs only in your browser.'),
    popup({}, 560),
  ),
  1280,
  800,
  join(root, 'store', 'screenshot-1.png'),
);

shoot(
  slide(
    brand +
      h('See what was hidden, and why') +
      p('Every reason has its own count and its own on/off switch.') +
      p('Open the distance count to see each out-of-range town, nearest first.') +
      p('Add your own keywords to hide, separated by commas.'),
    popup({ openFar: true, openWords: true }, 606, 1.18),
  ),
  1280,
  800,
  join(root, 'store', 'screenshot-2.png'),
);

// Before / after: made-up cards, coloured tiles instead of photos.
const card = (price, title, where, hidden, tile) => `<div style="width:150px;background:#FBFAF5;border-radius:12px;padding:8px;
  box-sizing:border-box;${hidden ? 'opacity:.5;outline:2px dashed #B9605A;outline-offset:-2px' : 'box-shadow:0 2px 8px rgba(31,42,31,.08)'}">
  <div style="height:120px;border-radius:8px;background:${tile}"></div>
  <div style="margin-top:8px;font-size:16px;font-weight:700">${price}</div>
  <div style="font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${title}</div>
  <div style="font-size:14px;color:${hidden ? '#B9605A' : '#6B7565'}">${where}</div></div>`;
const grid = (label, cards) => `<div><div style="font-size:22px;font-weight:600;margin-bottom:14px">${label}</div>
  <div style="display:grid;grid-template-columns:repeat(3,150px);gap:14px">${cards.join('')}</div></div>`;
shoot(
  `<div style="width:1280px;height:800px;box-sizing:border-box;background:#E9E5D6;padding:52px 0 0;${FONT};text-align:center">
    <div style="display:inline-block">${brand}</div>
    <h1 style="margin:22px 0 40px;font-size:46px;font-weight:700">Less scrolling past things you can't pick up</h1>
    <div style="display:flex;justify-content:center;gap:90px;text-align:left">
      ${grid('Before', [
        card('$40', 'Oak desk', 'Springfield, IL', false, '#C9D8C5'),
        card('$15', 'Phone case', 'Ships to you', true, '#E3DCCB'),
        card('$35', 'Router', 'Partner listing', true, '#D5DCE3'),
        card('$40', 'Oak desk', 'Duplicate', true, '#C9D8C5'),
        card('$0', 'ISO: kids bike', '"ISO"', true, '#E6D9D3'),
        card('$120', 'Recliner', 'St. Louis, MO', true, '#DCE3C9'),
      ])}
      ${grid('After', [
        card('$40', 'Oak desk', 'Springfield, IL', false, '#C9D8C5'),
        card('$60', 'Bookshelf', 'Chatham, IL', false, '#D8D2BE'),
        card('$25', 'Table lamp', 'Rochester, IL', false, '#C6D6DB'),
        card('$90', 'Bike', 'Sherman, IL', false, '#D6CFC5'),
        card('$20', 'Plant stand', 'Chatham, IL', false, '#CBDBD2'),
        card('$55', 'Armchair', 'Riverton, IL', false, '#DDD0C8'),
      ])}
    </div></div>`,
  1280,
  800,
  join(root, 'store', 'screenshot-3.png'),
);

// README image: the popup alone, at its real size.
shoot(
  `<iframe src="${popupUrl({})}" style="display:block;width:340px;height:560px;border:0"></iframe>`,
  340,
  560,
  join(root, 'docs', 'images', 'popup.png'),
);

rmSync(work, { recursive: true, force: true });
console.log('Rendered store/screenshot-{1,2,3}.png and docs/images/popup.png');
