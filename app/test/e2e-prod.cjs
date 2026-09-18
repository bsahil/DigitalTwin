const { chromium } = require('playwright');
const URL_ = process.argv[2] || 'http://localhost:4173/preview-artifact.html';

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
    args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });

  // Desktop pass: full flow on the production bundle.
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('requestfailed', r => errors.push('REQFAIL: ' + r.url().split('/').pop() + ' ' + r.failure()?.errorText));

  await page.goto(URL_, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid=file-input]', { state: 'attached', timeout: 15000 });
  console.log('app booted');

  await page.setInputFiles('[data-testid=file-input]', 'test/fixtures/report-a.pdf');
  await page.waitForSelector('text=We found', { timeout: 30000 });
  console.log('parsed:', await page.locator('h1').first().innerText());

  await page.click('text=Confirm & Build My Body');
  await page.waitForSelector('[data-testid=layer-normal]', { timeout: 25000 });
  await page.waitForSelector('[data-testid=body-loading]', { state: 'detached', timeout: 30000 });
  await page.waitForTimeout(1500);
  const gl = await page.evaluate(() => { const c = document.querySelector('canvas'); return c && c.width > 0; });
  console.log('3D canvas rendering:', gl, '| body asset loaded (loading overlay gone)');
  await page.screenshot({ path: '/tmp/shots/p-desktop.png' });

  await page.click('[data-testid=data-check-button]');
  await page.waitForSelector('[data-testid=data-check-panel]');
  console.log('data check opens:', await page.locator('[data-testid^=flag-]').count(), 'flags');
  await page.screenshot({ path: '/tmp/shots/p-desktop-check.png' });

  // Phone pass.
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  phone.on('pageerror', e => errors.push('PHONE PAGEERROR: ' + e.message));
  await phone.goto(URL_, { waitUntil: 'networkidle' });
  await phone.setInputFiles('[data-testid=file-input]', 'test/fixtures/report-a.pdf');
  await phone.waitForSelector('text=We found', { timeout: 30000 });
  await phone.screenshot({ path: '/tmp/shots/p-phone-verify.png' });
  const hscroll = await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  console.log('phone verify horizontal scroll:', hscroll);

  await phone.click('text=Confirm & Build My Body');
  await phone.waitForSelector('[data-testid=layer-normal]', { timeout: 25000 });
  await phone.waitForSelector('[data-testid=body-loading]', { state: 'detached', timeout: 30000 });
  await phone.waitForTimeout(1500);
  await phone.screenshot({ path: '/tmp/shots/p-phone-body.png' });
  const hscroll2 = await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  console.log('phone body horizontal scroll:', hscroll2);

  await phone.click('[data-testid=data-check-button]');
  await phone.waitForTimeout(800);
  const drawer = await phone.locator('[data-testid=data-check-panel]').boundingBox();
  console.log('phone drawer box:', JSON.stringify(drawer));
  await phone.screenshot({ path: '/tmp/shots/p-phone-drawer.png' });

  console.log('ERRORS:', errors.length ? errors.slice(0,6) : 'none');
  await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
