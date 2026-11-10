// Phase 3 verification: the list views over the Stage, hover preview, scene snapshots, the lobby's
// request budget, and the REC indicator. Needs `npm run mock` and `npm run dev`.
//   CHROME=<path to chrome.exe> node dev/browse-shots.mjs [--set <name>]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const args = process.argv.slice(2);
const set = args.includes('--set') ? args[args.indexOf('--set') + 1] : 'phase3';
const base = 'http://localhost:5173';
if (!process.env.CHROME) {
  console.error('Set CHROME to the path of a Chromium or Chrome executable.');
  process.exit(1);
}
const outDir = join(dirname(fileURLToPath(import.meta.url)), 'out', set);
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

const results = [];
const problems = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

async function open(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
  const page = await context.newPage();
  const requests = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.port === '8765' && u.pathname.startsWith('/api/')) requests.push(`${r.method()} ${u.pathname}${u.search}`);
  });
  page.on('pageerror', (e) => problems.push(`page error: ${e.message.slice(0, 200)}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/status of 40[01]/.test(m.text())) problems.push(`console: ${m.text().slice(0, 200)}`);
  });
  await page.goto(`${base}/login`);
  await page.fill('input[type=email]', 'ada@studio.dev');
  await page.fill('input[type=password]', 'hunter2hunter2');
  await page.click('button[type=submit]');
  await page.waitForURL('**/projects');
  return { context, page, requests };
}
const shot = (page, name) => page.screenshot({ path: join(outDir, `${name}.png`), animations: 'disabled' });
const wait = (page, ms) => page.waitForTimeout(ms);
// Waits for the Stage itself to report the scene drawn, then lets the camera settle. Software WebGL is slow.
const waitForScene = async (page, extraSettle = 0) => {
  await page.waitForFunction(() => window.__stage?.getState().scene.status === 'ready', undefined, { timeout: 90000 });
  await page.waitForTimeout(3500 + extraSettle);
};
const stageOpacity = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('.stage-fallback > div');
    return el ? getComputedStyle(el).opacity : 'no canvas';
  });
const idbKeys = (page) =>
  page.evaluate(async () => {
    // Read only: opening a database that does not exist yet would create it empty.
    const known = await indexedDB.databases();
    if (!known.some((d) => d.name === 'moodyblues-snapshots')) return [];
    return new Promise((resolve) => {
      const open = indexedDB.open('moodyblues-snapshots');
      open.onerror = () => resolve([]);
      open.onsuccess = () => {
        const db = open.result;
        if (!db.objectStoreNames.contains('snapshots')) return resolve([]);
        const req = db.transaction('snapshots').objectStore('snapshots').getAllKeys();
        req.onsuccess = () => resolve(req.result.map(String));
        req.onerror = () => resolve([]);
      };
    });
  });
// 1. The lobby, and what it costs.
{
  const { context, page, requests } = await open();
  requests.length = 0;
  await page.goto(`${base}/projects`);
  await wait(page, 5000);
  await shot(page, '01-projects-lobby');
  const api = requests.filter((r) => r.startsWith('GET'));
  const unique = new Set(api);
  console.log('lobby requests:\n  ' + [...unique].join('\n  '));
  check('lobby makes at most 13 distinct requests', unique.size <= 13, `${unique.size} distinct, ${api.length} total`);
  check('lobby shows a Now section for the recording session', (await page.getByText('Recording', { exact: true }).count()) > 0);
  check('and a Needs attention section', (await page.getByText('Needs attention').count()) > 0);
  check('lobby draws the dimmed Trace', Number(await stageOpacity(page)) > 0.3 && Number(await stageOpacity(page)) < 0.4, `opacity ${await stageOpacity(page)}`);
  await context.close();
}

// 2. A project, with the pointer resting on a scene.
{
  const { context, page } = await open();
  await page.goto(`${base}/projects/p1`);
  await wait(page, 2500);
  await shot(page, '02-project');
  check('project shows the REC indicator for the live session', (await page.getByLabel(/in progress/).count()) > 0);
  const row = page.locator('a[href$="/scenes/scene-forest"]').first();
  await row.hover();
  await waitForScene(page, 700);
  await shot(page, '03-project-hover-preview');
  check('resting on a scene brings the 3D in', Number(await stageOpacity(page)) > 0.7, `opacity ${await stageOpacity(page)}`);
  await page.mouse.move(700, 880);
  await wait(page, 2500);
  await shot(page, '04-project-after-hover');
  await context.close();
}

// 3. The scene, large and live, and its snapshot.
{
  const { context, page } = await open();
  await page.goto(`${base}/projects/p1/scenes/scene-forest`);
  await waitForScene(page);
  await shot(page, '05-scene');
  check('scene view draws the scene at full strength', (await stageOpacity(page)) === '1', `opacity ${await stageOpacity(page)}`);
  let keys = await idbKeys(page);
  for (let i = 0; i < 40 && !keys.some((k) => k.startsWith('snapshot:')); i++) {
    await wait(page, 500);
    keys = await idbKeys(page);
  }
  check('and keeps a snapshot of it for the lists', keys.some((k) => k.startsWith('snapshot:')), keys.join(', ') || 'none');
  // Dragging on the open part of the window orbits the scene.
  const before = await shotHash(page);
  await page.mouse.move(1100, 450);
  await page.mouse.down();
  await page.mouse.move(1250, 470, { steps: 8 });
  await page.mouse.up();
  await wait(page, 1200);
  const after = await shotHash(page);
  check('dragging in the open area moves the camera', before !== after);
  await shot(page, '06-scene-orbited');
  // Navigating away and back reuses the downloaded scene.
  await page.goto(`${base}/projects/p1/scenes/scene-forest/archive`);
  await wait(page, 2500);
  await shot(page, '07-scene-archive');
  await page.goto(`${base}/projects/p1/scenes/scene-forest/settings`);
  await wait(page, 1500);
  await shot(page, '08-scene-settings');
  await context.close();
}

// 4. The lobby once snapshots exist, and phones.
{
  const { context, page } = await open();
  await page.goto(`${base}/projects/p1/scenes/scene-forest`);
  let stored = await idbKeys(page);
  for (let i = 0; i < 60 && !stored.some((k) => k.startsWith('snapshot:')); i++) {
    await wait(page, 500);
    stored = await idbKeys(page);
  }
  await page.goto(`${base}/projects`);
  await wait(page, 3500);
  await shot(page, '09-lobby-with-snapshot');
  const cardImages = await page.locator('ul[aria-label], section[aria-label="Your projects"] img').count();
  check('the lobby card for that project now shows the captured snapshot', cardImages > 0, `${cardImages} snapshot images`);
  await context.close();

  const phone = await open({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await phone.page.goto(`${base}/projects`);
  await wait(phone.page, 3000);
  await shot(phone.page, '10-phone-lobby');
  check('phone lobby creates no WebGL canvas', (await phone.page.locator('canvas').count()) === 0);
  await phone.page.goto(`${base}/projects/p1/scenes/scene-forest`);
  await wait(phone.page, 3000);
  await shot(phone.page, '11-phone-scene');
  check('phone scene creates no WebGL canvas', (await phone.page.locator('canvas').count()) === 0);
  check('phone scene has no horizontal scroll', !(await phone.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)));
  await phone.context.close();
}

async function shotHash(page) {
  const buf = await page.screenshot({ animations: 'disabled', clip: { x: 800, y: 100, width: 600, height: 600 } });
  let h = 0;
  for (let i = 0; i < buf.length; i += 97) h = (h * 31 + buf[i]) | 0;
  return h;
}

await browser.close();
const unique = [...new Set(problems)];
console.log(`\n${results.filter(Boolean).length} of ${results.length} checks passed.`);
if (unique.length) console.log(`${unique.length} unexpected problem(s):\n  ${unique.join('\n  ')}`);
console.log(`Screenshots: ${outDir}`);
process.exit(results.includes(false) || unique.length ? 1 : 0);
