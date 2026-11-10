// Phase 6 verification: the scene inspector on the root Stage. Needs `npm run mock` and `npm run dev`.
//   CHROME=<path to chrome.exe> node dev/inspector-shots.mjs [--set <name>]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const args = process.argv.slice(2);
const set = args.includes('--set') ? args[args.indexOf('--set') + 1] : 'phase6';
const base = 'http://localhost:5173';
const INSPECT = `${base}/projects/p1/scenes/scene-forest/inspect`;
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

const problems = [];
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

async function open(viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.on('pageerror', (e) => problems.push(`page error: ${e.message.slice(0, 200)}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/status of 40[01]/.test(m.text())) problems.push(`console: ${m.text().slice(0, 200)}`);
  });
  await page.goto(`${base}/login`);
  await page.fill('input[type=email]', 'ada@studio.dev');
  await page.fill('input[type=password]', 'hunter2hunter2');
  await page.click('button[type=submit]');
  await page.waitForURL('**/projects');
  return { context, page };
}
const shot = (page, name) => page.screenshot({ path: join(outDir, `${name}.png`), animations: 'disabled' });
const wait = (page, ms) => page.waitForTimeout(ms);
const ready = (page) => page.waitForFunction(() => window.__stage?.getState().scene.status === 'ready', undefined, { timeout: 90000 });
const selectionChip = (page) => page.getByRole('button', { name: 'Clear selection' });

// 1. Hierarchy, selection from the list, and from the viewport.
{
  const { context, page } = await open();
  await page.goto(INSPECT);
  await ready(page);
  await wait(page, 1500);
  await shot(page, '01-inspector');

  await page.keyboard.press('Alt+1');
  check('hierarchy lists Arena and its children', (await page.getByRole('treeitem', { name: 'Arena' }).count()) === 1 && (await page.getByRole('treeitem', { name: 'Crate_A' }).count()) === 1);
  check('nothing selected at first', (await selectionChip(page).count()) === 0);

  await page.getByRole('treeitem', { name: 'Crate_A' }).click();
  await wait(page, 400);
  check('selecting in the list shows the chip', (await selectionChip(page).count()) === 1);
  check('details show the node', (await page.getByTestId('node-details').innerText()).includes('Crate_A'));
  await shot(page, '02-selected-from-list');

  await page.keyboard.press('Escape');
  check('Escape clears the selection', (await selectionChip(page).count()) === 0);

  // Click across the viewport until a crate is hit.
  const box = await page.locator('main > div').first().boundingBox();
  let hit = false;
  for (let gy = 0.3; gy <= 0.8 && !hit; gy += 0.05) {
    for (let gx = 0.15; gx <= 0.85 && !hit; gx += 0.05) {
      await page.mouse.click(box.x + box.width * gx, box.y + box.height * gy);
      await wait(page, 60);
      hit = (await selectionChip(page).count()) > 0;
    }
  }
  check('clicking the viewport selects an object', hit);
  if (hit) {
    await wait(page, 300);
    const text = await page.getByTestId('node-details').innerText().catch(() => '');
    check('and the hierarchy shows its details', text.length > 0);
    await shot(page, '03-selected-from-view');
  }

  await page.keyboard.press('a');
  await wait(page, 900);
  await context.close();
}

// 2. Materials, textures, geometries, stats, raw - and the texture thumbnails both ways.
for (const gpu of [false, true]) {
  const { context, page } = await open();
  await page.goto(`${INSPECT}${gpu ? '?thumbnails=gpu' : ''}`);
  await ready(page);
  const tag = gpu ? 'gpu' : 'canvas';

  await page.keyboard.press('Alt+2');
  await page.getByRole('button', { name: /FloorMat/ }).click();
  await page.locator('[data-thumb=ready]').first().waitFor({ timeout: 15000 });
  check(`materials: a texture preview renders (${tag})`, true);
  if (!gpu) await shot(page, '04-materials');

  // The preview is the real image: the checker's two colours.
  const pixel = await page.evaluate(async () => {
    const img = document.querySelector('[data-thumb=ready] img');
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return { w: c.width, h: c.height, a: [...ctx.getImageData(1, 1, 1, 1).data], b: [...ctx.getImageData(c.width - 2, 1, 1, 1).data] };
  });
  const near = (p, q) => p.every((v, i) => Math.abs(v - q[i]) < 40);
  const amber = [255, 181, 71];
  const blue = [40, 70, 160];
  check(
    `thumbnail pixels are the checker colours (${tag})`,
    (near(pixel.a.slice(0, 3), amber) && near(pixel.b.slice(0, 3), blue)) || (near(pixel.a.slice(0, 3), blue) && near(pixel.b.slice(0, 3), amber)),
    `${pixel.w}x${pixel.h} ${pixel.a} ${pixel.b}`,
  );

  await page.keyboard.press('Alt+3');
  const textures = await page.getByRole('button', { name: /Checker/ }).count();
  check(`textures: the shared image is listed once (${tag})`, textures === 1, `${textures}`);
  if (!gpu) {
    await page.getByRole('button', { name: /Checker/ }).click();
    const body = await page.locator('aside[aria-label="Panel dock"]').innerText();
    check('texture shows size and users', body.includes('32×32') && body.includes('FloorMat') && body.includes('CrateGreen'));
    await shot(page, '05-textures');
  }

  if (!gpu) {
    await page.keyboard.press('Alt+4');
    const geo = await page.locator('aside[aria-label="Panel dock"]').innerText();
    check('geometries: 24 vertices, 12 triangles', geo.includes('24 vertices') && geo.includes('12 triangles'), geo.replace(/\s+/g, ' ').slice(0, 120));
    await shot(page, '06-geometries');

    await page.keyboard.press('Alt+5');
    await page.getByText(/^\d/, { exact: false }).first().waitFor();
    await page.waitForFunction(() => !document.body.innerText.includes('measuring'), undefined, { timeout: 10000 });
    const stats = await page.locator('aside[aria-label="Panel dock"]').innerText();
    check('stats: counts and draw calls', stats.includes('Draw calls') && stats.includes('Nodes') && stats.includes('moodyblues-dev-mock'), stats.replace(/\s+/g, ' ').slice(0, 160));
    await shot(page, '07-stats');

    await page.keyboard.press('Alt+6');
    await page.getByRole('tab', { name: 'glTF file' }).click();
    await wait(page, 300);
    const raw = await page.locator('aside[aria-label="Panel dock"]').innerText();
    check('raw: shows the file JSON', raw.includes('asset') && raw.includes('nodes'));
    await shot(page, '08-raw');
  }
  await context.close();
}

// 3. A phone.
{
  const { context, page } = await open({ width: 390, height: 844 });
  await page.goto(INSPECT);
  await ready(page);
  await wait(page, 1200);
  await shot(page, '09-phone');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('phone: no horizontal overflow', overflow <= 0, `${overflow}px`);
  await context.close();
}

await browser.close();
if (problems.length) {
  console.log('\nBrowser problems:');
  for (const p of [...new Set(problems)]) console.log('  ' + p);
}
check('no browser errors', problems.length === 0);
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
