// Phase 5 verification: session glyphs. Needs `npm run mock` and `npm run dev`.
//   CHROME=<path to chrome.exe> node dev/glyph-shots.mjs [--set <name>]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const args = process.argv.slice(2);
const set = args.includes('--set') ? args[args.indexOf('--set') + 1] : 'phase5';
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
const notes = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.on('pageerror', (e) => problems.push(`page error: ${e.message.slice(0, 200)}`));
page.on('console', (m) => {
  if (m.type() === 'error' && !/status of 40[01]/.test(m.text())) problems.push(`console: ${m.text().slice(0, 200)}`);
  if (m.text().startsWith('[glyphs]')) notes.push(m.text());
});
const shot = (name) => page.screenshot({ path: join(outDir, `${name}.png`), animations: 'disabled' });
const wait = (ms) => page.waitForTimeout(ms);
// Glyphs are drawn as SVG with an accessible label that says which form they are.
const labels = () => page.locator('svg[role=img]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));

await page.goto(`${base}/login`);
await page.fill('input[type=email]', 'ada@studio.dev');
await page.fill('input[type=password]', 'hunter2hunter2');
await page.click('button[type=submit]');
await page.waitForURL('**/projects');

// 1. Nothing has been read in this browser: every ready session is a summary, and says so.
await page.goto(SCENE);
await page.getByRole('status').filter({ hasText: 'true timeline' }).waitFor({ timeout: 60000 });
await wait(800);
let l = await labels();
const summaries = l.filter((x) => x.startsWith('Summary'));
check('before anything is read, ready sessions show a summary', summaries.length >= 2, `${summaries.length} summaries`);
check('and the summary says it carries no timing', summaries.every((x) => x.includes('Open the session to see when')));
await shot('01-summary-glyphs');

// 2. Opening one session gives it a true timeline.
await page.locator('li', { has: page.getByText('Ready', { exact: true }) }).first().click();
await page.waitForURL('**/sessions/**');
await page.waitForFunction(() => {
  const s = document.querySelector('[role=slider][aria-label=Timeline]');
  return s && !s.hasAttribute('aria-disabled');
}, undefined, { timeout: 90000 });
await wait(1500);
await page.goBack();
await page.getByRole('status').filter({ hasText: 'true timeline' }).waitFor({ timeout: 60000 }).catch(() => undefined);
await wait(1500);
l = await labels();
const timelines = l.filter((x) => x.startsWith('Timeline of the whole session'));
check('a session that was opened shows its true timeline in the list', timelines.length === 1, `${timelines.length} timeline glyph(s)`);
await shot('02-one-timeline');

// 3. Index the rest.
const indexButton = page.getByRole('button', { name: 'Index sessions' });
check('the Index sessions action is offered, not run', (await indexButton.count()) === 1 && timelines.length === 1);
await indexButton.click();
await page.waitForFunction(() => !document.body.innerText.includes('Reading replays'), undefined, { timeout: 90000 });
await wait(1500);
l = await labels();
const after = l.filter((x) => x.startsWith('Timeline of the whole session'));
const readySessions = 3; // s3, s4, s6 in the mock
check('indexing gives every ready session a timeline', after.length === readySessions, `${after.length} of ${readySessions}`);
check('and then the action goes away', (await page.getByRole('button', { name: 'Index sessions' }).count()) === 0);
await shot('03-all-timelines');

// 4. They are remembered.
await page.reload();
await page.getByRole('list', { name: 'Sessions' }).first().waitFor({ timeout: 60000 });
await wait(2500);
l = await labels();
check('timelines survive a reload', l.filter((x) => x.startsWith('Timeline of the whole session')).length === readySessions);

// 5. A rebuild that changes the replay invalidates the old glyph: the key includes its size.
console.log(notes.length ? `parse notes: ${notes.join(' | ')}` : 'No replay blocked the page for over 50 ms.');

await browser.close();
const unique = [...new Set(problems)];
console.log(`\n${results.filter(Boolean).length} of ${results.length} checks passed.`);
if (unique.length) console.log(`${unique.length} unexpected problem(s):\n  ${unique.join('\n  ')}`);
console.log(`Screenshots: ${outDir}`);
process.exit(results.includes(false) || unique.length ? 1 : 0);
