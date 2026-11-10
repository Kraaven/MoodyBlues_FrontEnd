// Phase 7 verification: Debug panel, no-WebGL, reduced motion, keyboard, contrast.
//   CHROME=<path to chrome.exe> node dev/phase7-checks.mjs [--set <name>]
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const set = args.includes('--set') ? args[args.indexOf('--set') + 1] : 'phase7';
const base = 'http://localhost:5173';
const INSPECT = `${base}/projects/p1/scenes/scene-forest/inspect`;
const SESSION = `${base}/projects/p1/scenes/scene-forest/sessions/s3`;
if (!process.env.CHROME) {
  console.error('Set CHROME to the path of a Chromium or Chrome executable.');
  process.exit(1);
}
const outDir = join(here, 'out', set);
mkdirSync(outDir, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

// ---- Contrast, from the tokens themselves -------------------------------------------------------
{
  const css = readFileSync(join(here, '..', 'src', 'styles', 'tokens.css'), 'utf8');
  const token = (name) => css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`))[1];
  const lum = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  const grounds = ['ink-0', 'ink-1', 'ink-2', 'ink-3'];
  for (const fg of ['fg', 'fg-2', 'fg-3', 'blue-bright', 'now', 'danger', 'ok', 'wait', 'caution', 'live']) {
    const worst = Math.min(...grounds.map((g) => ratio(token(fg), token(g))));
    check(`contrast ${fg} on every ink >= 4.5`, worst >= 4.5, worst.toFixed(2));
  }
  const button = ratio(token('on-blue'), token('blue-deep'));
  check('white on the primary button (blue-deep) >= 4.5', button >= 4.5, button.toFixed(2));
}

const browser = await chromium.launch({
  executablePath: process.env.CHROME,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const problems = [];
async function open(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
  const page = await context.newPage();
  const requested = [];
  page.on('request', (r) => requested.push(r.url()));
  page.on('pageerror', (e) => problems.push(`page error: ${e.message.slice(0, 200)}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/status of 40[01]/.test(m.text())) problems.push(`console: ${m.text().slice(0, 200)}`);
  });
  await page.goto(`${base}/login`);
  await page.fill('input[type=email]', 'ada@studio.dev');
  await page.fill('input[type=password]', 'hunter2hunter2');
  await page.click('button[type=submit]');
  await page.waitForURL('**/projects');
  return { context, page, requested };
}
const shot = (page, name) => page.screenshot({ path: join(outDir, `${name}.png`), animations: 'disabled' });
const ready = (page) => page.waitForFunction(() => window.__stage?.getState().scene.status === 'ready', undefined, { timeout: 90000 });

// ---- Debug panel: absent by default, present with ?debug, remembered, switched off with ?debug=0 ---
{
  const { context, page, requested } = await open();
  await page.goto(INSPECT);
  await ready(page);
  check('no Debug panel by default', (await page.locator('aside[aria-label=Debug]').count()) === 0);
  check('and its code is never requested', !requested.some((u) => /debug\/Debug/.test(u)));
  await context.close();
}
{
  const { context, page } = await open();
  await page.goto(`${INSPECT}?debug`);
  await ready(page);
  await page.locator('aside[aria-label=Debug]').waitFor();
  check('?debug shows the Debug panel', true);
  await page.waitForFunction(() => document.querySelector('aside[aria-label=Debug]').innerText.includes('ms avg'), undefined, { timeout: 15000 });
  check('it reports frame times', true);
  for (const name of ['Wireframe', 'Axes', 'Bounds', 'Show inactive', 'Fog']) {
    await page.locator('aside[aria-label=Debug]').getByRole('button', { name }).click();
  }
  await page.waitForTimeout(1500);
  await shot(page, '01-debug-toggles');
  const pressed = await page.locator('aside[aria-label=Debug] [aria-pressed=true]').count();
  check('toggles press (fog starts on, so turning it off leaves four on)', pressed === 4, `${pressed}`);
  for (const name of ['Wireframe', 'Axes', 'Bounds', 'Show inactive', 'Fog']) {
    await page.locator('aside[aria-label=Debug]').getByRole('button', { name }).click();
  }
  await page.waitForTimeout(500);
  await page.goto(INSPECT);
  await ready(page);
  check('remembered on the next visit', (await page.locator('aside[aria-label=Debug]').count()) === 1);
  await page.goto(`${INSPECT}?debug=0`);
  await ready(page);
  check('?debug=0 turns it off', (await page.locator('aside[aria-label=Debug]').count()) === 0);
  await context.close();
}

// ---- No WebGL: the tools still work as lists --------------------------------------------------
for (const [name, url, expectText] of [
  ['inspector', `${INSPECT}?stage=off`, 'Hierarchy'],
  ['session', `${SESSION}?stage=off`, 'Logs'],
  ['scene page', `${base}/projects/p1/scenes/scene-forest?stage=off`, 'ForestLevel'],
  ['projects', `${base}/projects?stage=off`, 'Hollow Forest VR'],
]) {
  const { context, page } = await open();
  await page.goto(url);
  await page.waitForTimeout(2500);
  const canvases = await page.locator('canvas').count();
  const text = await page.locator('body').innerText();
  check(`no WebGL, ${name}: no canvas, content still there`, canvases === 0 && text.includes(expectText), `canvases=${canvases}`);
  await shot(page, `02-no-webgl-${name.replace(' ', '-')}`);
  await context.close();
}
{
  // The inspector with no WebGL must say so rather than wait forever.
  const { context, page } = await open();
  await page.goto(`${INSPECT}?stage=off`);
  await page.waitForTimeout(2500);
  const text = (await page.locator('body').innerText()).toLowerCase();
  check('no WebGL, inspector: says the 3D view is unavailable', /3d|webgl/.test(text), text.replace(/\s+/g, ' ').slice(0, 100));
  await context.close();
}

// ---- Reduced motion --------------------------------------------------------------------------
{
  const { context, page } = await open({ reducedMotion: 'reduce' });
  await page.goto(`${base}/projects`);
  await page.waitForTimeout(2000);
  const durations = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('*')) {
      const s = getComputedStyle(el);
      const d = parseFloat(s.animationDuration);
      if (s.animationName !== 'none' && d > 0.05) out.push(`${el.className.toString().slice(0, 40)}: ${s.animationName} ${s.animationDuration}`);
    }
    return out;
  });
  check('reduced motion: no CSS animation longer than 50 ms is running', durations.length === 0, durations.slice(0, 3).join(' | '));
  await shot(page, '03-reduced-motion');
  await context.close();
}

// ---- Keyboard: the rail and a tree row can be reached and used without a pointer --------------
{
  const { context, page } = await open();
  await page.goto(INSPECT);
  await ready(page);
  let railFocused = false;
  let rowFocused = false;
  for (let i = 0; i < 40 && !(railFocused && rowFocused); i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      return { label: el?.getAttribute('aria-label') ?? '', role: el?.getAttribute('role') ?? '' };
    });
    if (info.label === 'Materials') railFocused = true;
    if (info.role === 'treeitem') {
      rowFocused = true;
      await page.keyboard.press('Enter');
    }
  }
  check('Tab reaches the panel rail', railFocused);
  check('Tab reaches a hierarchy row, and Enter selects it', rowFocused && (await page.getByRole('button', { name: 'Clear selection' }).count()) === 1);
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
