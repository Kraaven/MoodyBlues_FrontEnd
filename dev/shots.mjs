// Screenshots every view and state of the dashboard against the dev mock backend.
//
//   npm run mock            (terminal 1)
//   npm run dev             (terminal 2)
//   CHROME=<path to chrome.exe> npm run shots -- --set before
//
// Options: --set <name>   output folder under dev/out (default "current")
//          --only <text>  only shots whose name contains the text
//          --base <url>   dashboard address (default http://localhost:5173)
// Needs a Chromium: set CHROME to its path (Playwright's own download works).
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const set = arg('set', 'current');
const only = arg('only', '');
const base = arg('base', 'http://localhost:5173');
const executablePath = process.env.CHROME;
if (!executablePath) {
  console.error('Set CHROME to the path of a Chromium or Chrome executable.');
  process.exit(1);
}

const outDir = join(dirname(fileURLToPath(import.meta.url)), 'out', set);
mkdirSync(outDir, { recursive: true });

// Software WebGL so the 3D renders without a GPU.
const browser = await chromium.launch({
  executablePath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

const problems = [];
const SCENE = '/projects/p1/scenes/scene-forest';

// [name, path, settle ms, optional action]
const shots = [
  ['auth-login', '/login', 1500],
  ['auth-register', '/register', 800],
  ['projects', '/projects', 2000],
  ['project', '/projects/p1', 1500],
  ['project-no-key', '/projects/p2', 1500],
  ['scene-sessions', SCENE, 4000],
  ['scene-archive', `${SCENE}/archive`, 1500],
  ['scene-settings', `${SCENE}/settings`, 1500],
  ['inspector', `${SCENE}/inspect?version=3`, 4500],
  ['player-start', `${SCENE}/sessions/s3`, 6000],
  ['player-spawn', `${SCENE}/sessions/s3?t=25`, 6000],
  ['player-error-log', `${SCENE}/sessions/s3?t=62.4`, 6000],
  ['player-recording', `${SCENE}/sessions/s1`, 2500],
  ['player-building', `${SCENE}/sessions/s2`, 2500],
  ['player-failed', `${SCENE}/sessions/s5`, 2500],
  ['player-waiting', `${SCENE}/sessions/s7`, 2500],
];
const variants = [
  ['desktop', { viewport: { width: 1440, height: 900 } }],
  ['narrow', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }],
  ['reduced-motion', { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' }],
];

for (const [variantName, options] of variants) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  page.on('pageerror', (e) => problems.push(`[${variantName}] page error: ${e.message.slice(0, 200)}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/status of 401/.test(m.text())) problems.push(`[${variantName}] console: ${m.text().slice(0, 200)}`);
  });

  // Sign in once per context (the mock sets a cookie).
  await page.goto(`${base}/login`);
  await page.fill('input[type=email]', 'ada@studio.dev');
  await page.fill('input[type=password]', 'hunter2hunter2');
  await page.click('button[type=submit]');
  await page.waitForURL('**/projects');

  for (const [name, path, settle] of shots) {
    if (only && !name.includes(only)) continue;
    if (name.startsWith('auth-')) {
      // Auth screens need a signed-out browser.
      const fresh = await browser.newContext(options);
      const p2 = await fresh.newPage();
      await p2.goto(`${base}${path}`);
      await p2.waitForTimeout(settle);
      await p2.screenshot({ path: join(outDir, `${variantName}--${name}.png`), animations: 'disabled' });
      await fresh.close();
      console.log(`${variantName}/${name}`);
      continue;
    }
    await page.goto(`${base}${path}`);
    await page.waitForTimeout(settle);
    await page.screenshot({ path: join(outDir, `${variantName}--${name}.png`), animations: 'disabled' });
    console.log(`${variantName}/${name}`);
  }
  await context.close();
}

await browser.close();
if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of [...new Set(problems)]) console.log(`  ${p}`);
} else {
  console.log('\nNo page errors or console errors.');
}
console.log(`Screenshots: ${outDir}`);
