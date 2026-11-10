// Phase 4 verification: the session player on the root Stage. Needs `npm run mock` and `npm run dev`.
//   CHROME=<path to chrome.exe> node dev/player-shots.mjs [--set <name>]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const args = process.argv.slice(2);
const set = args.includes('--set') ? args[args.indexOf('--set') + 1] : 'phase4';
const base = 'http://localhost:5173';
const SCENE = `${base}/projects/p1/scenes/scene-forest`;
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
  // Counts React commits, to check the player does not re-render per frame.
  await context.addInitScript(() => {
    window.__commits = 0;
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true,
      renderers: new Map(),
      inject: () => 1,
      onCommitFiberRoot: () => {
        window.__commits++;
      },
      onCommitFiberUnmount: () => {},
      onPostCommitFiberRoot: () => {},
      checkDCE: () => {},
    };
  });
  const page = await context.newPage();
  const requests = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.port === '8765') requests.push(`${r.method()} ${u.pathname}`);
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
const slider = (page) => page.locator('[role=slider][aria-label=Timeline]');
const time = async (page) => Number(await slider(page).getAttribute('aria-valuenow'));
async function waitReady(page) {
  await page.waitForFunction(
    () => {
      const s = document.querySelector('[role=slider][aria-label=Timeline]');
      return s && !s.hasAttribute('aria-disabled');
    },
    undefined,
    { timeout: 90000 },
  );
}

// 1. Playing, selecting, following.
{
  const { context, page } = await open();
  await page.goto(`${SCENE}/sessions/s3?t=25`);
  await waitReady(page);
  await wait(page, 2500);
  await shot(page, '01-player-ready');
  const t0 = await time(page);
  check('deep link ?t=25 starts at 25 s, paused', Math.abs(t0 - 25) < 0.5, `t = ${t0}`);

  await page.keyboard.press('Space');
  const commits0 = await page.evaluate(() => window.__commits);
  await wait(page, 3000);
  const commits1 = await page.evaluate(() => window.__commits);
  const t1 = await time(page);
  check('Space plays: the playhead advances', t1 > t0 + 0.3, `${t0.toFixed(2)} to ${t1.toFixed(2)}`);
  const perSecond = (commits1 - commits0) / 3;
  check('playing causes at most 12 React commits a second', perSecond <= 12, `${perSecond.toFixed(1)} per second`);
  await page.keyboard.press('Space');

  await page.keyboard.press('Alt+2');
  await wait(page, 600);
  await page.getByRole('treeitem', { name: /Crate_A/ }).first().click();
  await wait(page, 1500);
  await shot(page, '02-player-selected');
  const chip = await page.locator('main').innerText();
  check('selecting shows the object and its Unity path', chip.includes('Crate_A') && chip.includes('Arena/Crate_A'), chip.match(/Arena\/Crate_A/) ? 'path shown' : 'no path');

  await page.keyboard.press('f');
  await page.keyboard.press('Space');
  await wait(page, 2500);
  await shot(page, '03-player-following');
  check('F turns follow on', (await page.getByRole('button', { name: 'Stop following' }).count()) > 0);
  await page.keyboard.press('Space');
  await page.keyboard.press('Escape');
  await context.close();
}

// 2. Panels: float, move, remember, dock, collapse.
{
  const { context, page } = await open();
  await page.goto(`${SCENE}/sessions/s3?t=62.4`);
  await waitReady(page);
  await page.keyboard.press('Alt+1');
  await wait(page, 600);
  await shot(page, '04-panel-logs-docked');

  await page.getByRole('button', { name: 'Float this panel' }).click();
  await wait(page, 600);
  const windowSel = 'section[aria-label="Logs window"]';
  check('Float pops the panel out into a window', (await page.locator(windowSel).count()) === 1);
  const before = await page.locator(windowSel).boundingBox();
  const header = page.locator(`${windowSel} header`);
  const hb = await header.boundingBox();
  await page.mouse.move(hb.x + 100, hb.y + 12);
  await page.mouse.down();
  await page.mouse.move(hb.x - 220, hb.y + 140, { steps: 8 });
  await page.mouse.up();
  await wait(page, 400);
  const after = await page.locator(windowSel).boundingBox();
  check('dragging the header moves the window', Math.abs(after.x - before.x) > 100 && Math.abs(after.y - before.y) > 60, `moved ${Math.round(after.x - before.x)}, ${Math.round(after.y - before.y)}`);
  await shot(page, '05-panel-logs-floating');

  await page.reload();
  await waitReady(page);
  await wait(page, 800);
  const rememberedBox = await page.locator(windowSel).boundingBox().catch(() => null);
  check('the floating layout survives a reload', rememberedBox !== null && Math.abs(rememberedBox.x - after.x) < 3, rememberedBox ? `x ${Math.round(rememberedBox.x)}` : 'gone');

  // A shrunk window pulls the panel back into view.
  await page.setViewportSize({ width: 700, height: 500 });
  await wait(page, 800);
  const small = await page.locator(windowSel).boundingBox();
  const regionBox = await page.locator('main > div').first().boundingBox();
  check('shrinking the window keeps the panel reachable', small !== null && small.x < regionBox.x + regionBox.width - 40 && small.y < regionBox.y + regionBox.height - 20, small ? `x ${Math.round(small.x)}` : 'gone');
  await page.setViewportSize({ width: 1440, height: 900 });
  await wait(page, 500);

  await page.locator(`${windowSel}`).getByRole('button', { name: 'Dock this panel' }).click();
  await wait(page, 500);
  check('Dock puts it back in the column', (await page.locator(windowSel).count()) === 0 && (await page.locator('aside[aria-label="Panel dock"]').count()) === 1);

  await page.keyboard.press('\\');
  await wait(page, 400);
  check('backslash collapses the dock', (await page.locator('aside[aria-label="Panel dock"]').count()) === 0);
  await page.keyboard.press('Alt+3');
  await wait(page, 400);
  check('Alt+3 opens Details in the dock again', (await page.locator('aside[aria-label="Panel dock"]').count()) === 1);
  await shot(page, '06-panel-details');
  await page.keyboard.press('Alt+4');
  await wait(page, 400);
  await shot(page, '07-panel-raw');
  await page.keyboard.press('?');
  await wait(page, 500);
  await shot(page, '08-shortcuts');
  await context.close();
}

// 3. The scene is downloaded once on the way from the scene page into a session.
{
  const { context, page, requests } = await open();
  await page.goto(SCENE);
  // Wait for the scene itself rather than for a fixed time: the first load in dev is slow.
  for (let i = 0; i < 80 && !requests.some((r) => r.endsWith('/file')); i++) await wait(page, 500);
  await wait(page, 6000);
  const before = requests.filter((r) => r.endsWith('/file')).length;
  console.log('requests on the scene page:', [...new Set(requests)].join(' | '));
  await page.getByText('Today', { exact: false }).first().waitFor();
  const readyRow = page.locator('li', { has: page.getByText('Ready', { exact: true }) }).first();
  await readyRow.click();
  await page.waitForURL('**/sessions/**');
  await waitReady(page);
  const files = requests.filter((r) => r.endsWith('/file')).length;
  check('opening a session after its scene does not download the scene again', files === before && before >= 1, `${before} before, ${files} after`);
  check('the replay was downloaded once', requests.filter((r) => r.endsWith('/replay')).length === 1);
  await context.close();
}

// 4. States that are not a playing replay.
{
  const { context, page } = await open();
  for (const [name, id, wantText] of [
    ['09-state-recording', 's1', 'still being recorded'],
    ['10-state-building', 's2', 'Building the replay'],
    ['11-state-failed', 's5', 'could not be built'],
    ['12-state-waiting', 's7', 'Waiting for the scene'],
  ]) {
    await page.goto(`${SCENE}/sessions/${id}`);
    await wait(page, 5000);
    await shot(page, name);
    check(`${id} explains itself`, (await page.getByText(wantText).count()) > 0, wantText);
  }
  await context.close();
}

// 5. A phone: the dock becomes a sheet.
{
  const { context, page } = await open({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await page.goto(`${SCENE}/sessions/s3?t=62.4`);
  await waitReady(page);
  await wait(page, 1500);
  await shot(page, '13-phone-player');
  check('phone player has no horizontal scroll', !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)));
  await context.close();
}

await browser.close();
const unique = [...new Set(problems)];
console.log(`\n${results.filter(Boolean).length} of ${results.length} checks passed.`);
if (unique.length) console.log(`${unique.length} unexpected problem(s):\n  ${unique.join('\n  ')}`);
console.log(`Screenshots: ${outDir}`);
process.exit(results.includes(false) || unique.length ? 1 : 0);
