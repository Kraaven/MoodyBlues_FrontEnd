// Exercises the root Stage through the dev lab (/_stage): camera moves, an interrupted transition,
// dimming, the loading marker, context loss and restore, the no-WebGL fallback and reduced motion.
// It needs no backend and no sign-in.
//
//   npm run dev
//   CHROME=<path to chrome.exe> node dev/stage-shots.mjs [--set <name>]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const args = process.argv.slice(2);
const setIndex = args.indexOf('--set');
const set = setIndex >= 0 ? args[setIndex + 1] : 'stage';
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

const problems = [];
const log = [];

async function open(query = '', options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
  const page = await context.newPage();
  page.on('pageerror', (e) => problems.push(`page error: ${e.message.slice(0, 200)}`));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text().slice(0, 200)}`);
    if (m.text().startsWith('[stage]')) log.push(m.text());
  });
  await page.goto(`${base}/_stage${query}`);
  await page.waitForSelector('canvas', { timeout: 20000 });
  return { context, page };
}

// CSS animations are paused for the capture; the 3D keeps running. (Software compositing chokes on animated gradients.)
const shot = (page, name) => page.screenshot({ path: join(outDir, `${name}.png`), animations: 'disabled' });
const click = (page, label) => page.getByRole('button', { name: label, exact: true }).click();
const readVar = (page, name) => page.evaluate((n) => document.documentElement.style.getPropertyValue(n), name);

// 1. Full motion: overview, then a close-up caught mid-move and after settling.
{
  const { context, page } = await open('?trace=full');
  await page.waitForTimeout(2500);
  await shot(page, '01-overview');
  const stats = await page.locator('dl').innerText().catch(() => '(no stats)');
  console.log('stats at rest (software WebGL, not a GPU):\n' + stats.replace(/\n/g, ' | '));

  await click(page, 'Close-up');
  await page.waitForTimeout(120);
  const midP = await readVar(page, '--view-p');
  await shot(page, '02-closeup-mid-transition');
  await page.waitForTimeout(1800);
  const endP = await readVar(page, '--view-p');
  await shot(page, '03-closeup-settled');
  console.log(`--view-p: mid-transition ${midP}, settled ${endP}`);

  await click(page, 'Top-down');
  await page.waitForTimeout(1800);
  await shot(page, '04-top-down');

  await click(page, 'Dimmed 35%');
  await page.waitForTimeout(1500);
  await shot(page, '05-dimmed');
  console.log('--stage-dim after dimming:', await readVar(page, '--stage-dim'));

  await click(page, 'Simulate loading');
  await page.waitForTimeout(2000);
  await shot(page, '06-loading');

  await click(page, 'Lose context');
  await page.waitForTimeout(1200);
  await shot(page, '07-context-lost');
  await click(page, 'Restore');
  // Poll for the status instead of guessing a delay: software WebGL is slow to rebuild.
  let status = 'lost';
  for (let i = 0; i < 40 && status !== 'ok'; i++) {
    await page.waitForTimeout(250);
    status = (await page.locator('p', { hasText: 'Development only' }).innerText()).match(/status (\w+)/)?.[1] ?? '?';
  }
  console.log('status after restore:', status);
  await page.waitForTimeout(1500);
  await shot(page, '08-context-restored');
  await context.close();
}

// 2. Transition timing. Software WebGL is far too slow at full size to sample a 600 ms move, so
// this runs in a small window where frames are quick. The transition maths itself is unit-tested.
{
  const { context, page } = await open('', { viewport: { width: 420, height: 380 } });
  await page.waitForTimeout(2000);
  const sample = async (n, gap) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push(Number(await readVar(page, '--view-p')));
      await page.waitForTimeout(gap);
    }
    return out.map((s) => s.toFixed(2)).join(' ');
  };
  await click(page, 'Close-up');
  console.log('--view-p during one move (50 ms apart):', await sample(16, 50));
  await page.waitForTimeout(800);
  await click(page, 'Interrupt');
  console.log('--view-p across an interrupted move (60 ms apart):', await sample(18, 60));
  await shot(page, '09-after-interrupt-small-window');
  await context.close();
}

// 3. Reduced motion: no drift, moves are cuts.
{
  const { context, page } = await open('?motion=reduce', { reducedMotion: 'reduce' });
  await page.waitForTimeout(1500);
  await shot(page, '10-reduced-motion-overview');
  await click(page, 'Close-up');
  await page.waitForTimeout(150);
  console.log('reduced motion --view-p right after a move (expect 1):', await readVar(page, '--view-p'));
  await shot(page, '11-reduced-motion-closeup');
  await context.close();
}

// 4. No WebGL: the gradient fallback, and the page still works.
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => problems.push(`page error: ${e.message.slice(0, 200)}`));
  await page.goto(`${base}/_stage?stage=off`);
  await page.waitForTimeout(2000);
  await shot(page, '12-no-webgl-fallback');
  console.log('canvases with ?stage=off (expect 0):', await page.locator('canvas').count());
  await context.close();
}

await browser.close();
console.log(log.length ? `\nTrace notes:\n  ${log.join('\n  ')}` : '\nTrace did not step down.');
// The lab needs no sign-in, but the app still asks /auth/me; with no backend running that is a 401.
const unique = [...new Set(problems)].filter((p) => !/WEBGL_lose_context|Context Lost|CONTEXT_LOST|status of 401|ERR_CONNECTION_REFUSED/i.test(p));
console.log(unique.length ? `\n${unique.length} problem(s):\n  ${unique.join('\n  ')}` : '\nNo unexpected page or console errors.');
console.log(`Screenshots: ${outDir}`);
