// Walks the sign-in, register, sign-out and expired-session flows against the dev mock, checking
// each result and capturing the screens. Exits non-zero if any check fails.
//
//   npm run mock     (terminal 1)     npm run dev     (terminal 2)
//   CHROME=<path to chrome.exe> node dev/auth-flow.mjs [--set <name>]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const args = process.argv.slice(2);
const set = args.includes('--set') ? args[args.indexOf('--set') + 1] : 'phase2';
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
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

async function newPage(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
  const page = await context.newPage();
  page.on('pageerror', (e) => problems.push(`page error: ${e.message.slice(0, 200)}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/status of 40[01]/.test(m.text())) problems.push(`console: ${m.text().slice(0, 200)}`);
  });
  return { context, page };
}
const shot = (page, name) => page.screenshot({ path: join(outDir, `${name}.png`), animations: 'disabled' });
const settle = (page, ms = 1800) => page.waitForTimeout(ms);
const path = (page) => new URL(page.url()).pathname;

async function signIn(page, email = 'ada@studio.dev', password = 'hunter2hunter2') {
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password]', password);
  await page.click('button[type=submit]');
}

// 1. A signed-out visit to a deep link goes to sign-in, and signing in returns to it.
{
  const { context, page } = await newPage();
  await page.goto(`${base}/projects/p1`);
  await page.waitForURL('**/login');
  await settle(page);
  await shot(page, '01-login-desktop');
  check('signed-out deep link redirects to /login', path(page) === '/login');
  const dim = await page.evaluate(() => {
    const el = document.querySelector('.stage-fallback > div');
    return el ? getComputedStyle(el).opacity : 'no canvas';
  });
  check('desktop auth draws the stage at full strength', dim === '1', `stage opacity ${dim}`);
  await signIn(page);
  await page.waitForURL('**/projects/p1');
  check('after sign-in, returns to the deep link', path(page) === '/projects/p1');
  await context.close();
}

// 2. A wrong password shows the generic message and stays put.
{
  const { context, page } = await newPage();
  await page.goto(`${base}/login`);
  await signIn(page, 'ada@studio.dev', 'wrong-password');
  await page.waitForSelector('[role=alert]');
  const text = await page.locator('[role=alert]').innerText();
  check('wrong password shows the backend message', text.includes('Wrong email or password.'), text);
  check('and stays on /login', path(page) === '/login');
  await settle(page, 600);
  await shot(page, '02-login-error');
  await context.close();
}

// 3. Register: layout, a refused address, and the password rule.
{
  const { context, page } = await newPage();
  await page.goto(`${base}/register`);
  await settle(page);
  await shot(page, '03-register');
  await signIn(page, 'ada2@studio.dev', 'short');
  await page.waitForTimeout(400);
  check('a password under 8 characters is stopped before submitting', path(page) === '/register' && (await page.locator('[role=alert]').count()) === 0);
  await signIn(page, 'taken@studio.dev', 'hunter2hunter2');
  await page.waitForSelector('[role=alert]');
  check('a refused address shows the generic message', (await page.locator('[role=alert]').innerText()).includes('Could not create the account.'));
  await shot(page, '04-register-error');
  await page.fill('input[type=email]', 'new@studio.dev');
  await page.click('button[type=submit]');
  await page.waitForURL('**/projects');
  check('a valid registration lands on /projects', path(page) === '/projects');
  await context.close();
}

// 4. Keyboard only: focus order and a visible focus ring.
{
  const { context, page } = await newPage();
  await page.goto(`${base}/login`);
  await settle(page, 1200);
  const describe = () =>
    page.evaluate(() => {
      const el = document.activeElement;
      return el ? (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 30) + ` <${el.tagName.toLowerCase()}>` : 'none';
    });
  const order = [await describe()];
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Tab');
    order.push(await describe());
  }
  console.log('focus order from load:', order.join('  ->  '));
  check('email is focused on load', order[0].includes('<input>'));
  check('Tab moves email, password, submit, link', order[1].includes('<input>') && order[2].includes('Sign in <button>') && order[3].includes('Create one'));
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  const first = await describe();
  console.log('focus after tabbing back to the start:', first);
  check('shift+Tab from the form reaches the brand link and the skip link', /Skip to content|MoodyBlues home/.test(first), first);
  await shot(page, '05-keyboard-focus');
  // Submit with Enter from the password field.
  await page.fill('input[type=email]', 'ada@studio.dev');
  await page.fill('input[type=password]', 'hunter2hunter2');
  await page.press('input[type=password]', 'Enter');
  await page.waitForURL('**/projects');
  check('Enter in the password field signs in', path(page) === '/projects');
  await context.close();
}

// 5. Sign out through the account menu; the session is really gone.
{
  const { context, page } = await newPage();
  await page.goto(`${base}/login`);
  await signIn(page);
  await page.waitForURL('**/projects');
  await settle(page, 1200);
  await page.getByRole('button', { name: /^Account:/ }).click();
  await page.waitForTimeout(300);
  await shot(page, '06-account-menu');
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await page.waitForURL('**/login');
  check('Sign out returns to /login', path(page) === '/login');
  await page.goto(`${base}/projects`);
  await page.waitForURL('**/login');
  check('and /projects is protected again', path(page) === '/login');
  const notice = await page.getByText('Your session expired').count();
  check('a deliberate sign-out does not say the session expired', notice === 0);
  await context.close();
}

// 6. An expired session: the cookies vanish while the app is open.
{
  const { context, page } = await newPage();
  await page.goto(`${base}/login`);
  await signIn(page);
  await page.waitForURL('**/projects');
  await settle(page, 1200);
  await context.clearCookies();
  // The lobby has already cached every project, so go somewhere that has to ask the server.
  await page.evaluate(() => {
    window.history.pushState({}, '', '/projects/p3/scenes/unknown-scene');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await page.waitForURL('**/login', { timeout: 15000 });
  await page.getByText('Your session expired. Sign in again.').waitFor({ timeout: 5000 });
  check('an expired session lands on /login with the notice', path(page) === '/login');
  await settle(page, 800);
  await shot(page, '07-session-expired');
  await context.close();
}

// 7. Already signed in: /login and /register go to /projects.
{
  const { context, page } = await newPage();
  await page.goto(`${base}/login`);
  await signIn(page);
  await page.waitForURL('**/projects');
  await page.goto(`${base}/login`);
  await page.waitForURL('**/projects');
  check('a signed-in visit to /login redirects to /projects', path(page) === '/projects');
  await context.close();
}

// 8. Phone: the live stage is replaced by the static gradient.
{
  const { context, page } = await newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await page.goto(`${base}/login`);
  await settle(page, 2500);
  const canvases = await page.evaluate(() => document.querySelectorAll('canvas').length);
  check('phone auth creates no WebGL canvas at all', canvases === 0, `${canvases} canvases`);
  await shot(page, '08-login-phone');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check('phone auth has no horizontal scroll', !overflow);

  // Widening the window past the breakpoint brings the live stage in; narrowing again fades it out.
  const stageOpacity = () =>
    page.evaluate(() => {
      const el = document.querySelector('.stage-fallback > div');
      return el ? getComputedStyle(el).opacity : 'no canvas';
    });
  await page.setViewportSize({ width: 1200, height: 800 });
  await settle(page, 2500);
  const grown = await stageOpacity();
  check('widening the window brings the live stage in', grown === '1', `stage opacity ${grown}`);
  await page.setViewportSize({ width: 390, height: 844 });
  let shrunk = await stageOpacity();
  for (let i = 0; i < 40 && shrunk !== '0'; i++) {
    await page.waitForTimeout(250);
    shrunk = await stageOpacity();
  }
  check('narrowing it again fades the stage out', shrunk === '0', `stage opacity ${shrunk}`);
  await page.goto(`${base}/register`);
  await settle(page, 800);
  await shot(page, '09-register-phone');
  await context.close();
}

// 9. Reduced motion.
{
  const { context, page } = await newPage({ reducedMotion: 'reduce' });
  await page.goto(`${base}/login?motion=reduce`);
  await settle(page, 1500);
  await shot(page, '10-login-reduced-motion');
  await context.close();
}

// 10. The chrome on the pages that still use it: floating on browse views, one line on the player.
{
  const { context, page } = await newPage();
  await page.goto(`${base}/login`);
  await signIn(page);
  await page.waitForURL('**/projects');
  for (const [name, route, wait] of [
    ['11-chrome-projects', '/projects', 1500],
    ['12-chrome-scene', '/projects/p1/scenes/scene-forest', 2500],
    ['13-chrome-player-line', '/projects/p1/scenes/scene-forest/sessions/s3?t=25', 6000],
  ]) {
    await page.goto(`${base}${route}`);
    await settle(page, wait);
    await shot(page, name);
  }
  // Scroll a long page so content passes under the floating chrome.
  await page.goto(`${base}/projects/p1/scenes/scene-forest`);
  await settle(page, 2500);
  await page.mouse.wheel(0, 380);
  await settle(page, 600);
  await shot(page, '14-chrome-scrolled');
  await context.close();
  const { context: narrow, page: phone } = await newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await phone.goto(`${base}/login`);
  await signIn(phone);
  await phone.waitForURL('**/projects');
  await phone.goto(`${base}/projects/p1/scenes/scene-forest`);
  await settle(phone, 2500);
  await shot(phone, '15-chrome-scene-phone');
  const phoneOverflow = await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check('phone scene page has no horizontal scroll', !phoneOverflow);
  const phoneChevrons = await phone.evaluate(() => [...document.querySelectorAll('nav[aria-label=Breadcrumb] svg')].filter((s) => s.getClientRects().length > 0).length);
  check('phone breadcrumb shows its last two crumbs with one separator, none leading', phoneChevrons === 1, `${phoneChevrons} separators`);
  const wrapped = await phone.evaluate(() => [...document.querySelectorAll('nav[aria-label=Breadcrumb] a, nav[aria-label=Breadcrumb] span[aria-current]')].some((e) => e.getClientRects().length > 1));
  check('and no crumb wraps onto two lines', !wrapped);
  await narrow.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
const unique = [...new Set(problems)];
console.log(`\n${results.length - failed.length} of ${results.length} checks passed.`);
if (unique.length) console.log(`${unique.length} unexpected page/console problem(s):\n  ${unique.join('\n  ')}`);
console.log(`Screenshots: ${outDir}`);
process.exit(failed.length || unique.length ? 1 : 0);
