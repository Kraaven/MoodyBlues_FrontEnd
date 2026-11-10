// Debug aid: replays the browse checks' flows and reports the Stage's state over time.
import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: process.env.CHROME,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

async function session() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error' || m.text().includes('[stage]')) console.log(`   ${m.type()}: ${m.text().slice(0, 300)}`);
  });
  page.on('pageerror', (e) => console.log('   pageerror:', e.message.slice(0, 300)));
  await page.goto('http://localhost:5173/login');
  await page.fill('input[type=email]', 'ada@studio.dev');
  await page.fill('input[type=password]', 'hunter2hunter2');
  await page.click('button[type=submit]');
  await page.waitForURL('**/projects');
  return { context, page };
}
const state = (page) =>
  page.evaluate(() => {
    const st = window.__stage?.getState();
    const wrapper = document.querySelector('.stage-fallback > div');
    return st && { view: `${st.view.id}/${st.view.content}`, scene: st.scene.status, canvases: document.querySelectorAll('canvas').length, opacity: wrapper ? getComputedStyle(wrapper).opacity : 'none', url: location.pathname };
  });

console.log('A. project page, hover a scene');
{
  const { context, page } = await session();
  await page.goto('http://localhost:5173/projects/p1');
  await page.waitForTimeout(2500);
  await page.locator('a[href$="/scenes/scene-forest"]').first().hover();
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(1500);
    console.log(`  +${(i + 1) * 1.5}s`, JSON.stringify(await state(page)));
  }
  await context.close();
}
console.log('B. scene page, fresh context');
{
  const { context, page } = await session();
  await page.goto('http://localhost:5173/projects/p1/scenes/scene-forest');
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(1500);
    console.log(`  +${(i + 1) * 1.5}s`, JSON.stringify(await state(page)));
  }
  await context.close();
}
await browser.close();
