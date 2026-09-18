const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  const shot = async n => { await page.screenshot({ path: `/tmp/shots/b-${n}.png` }); console.log('shot', n); };

  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });

  // Fresh DB each run: upload both reports.
  await page.evaluate(() => indexedDB.deleteDatabase('body-atlas'));
  await page.reload({ waitUntil: 'networkidle' });

  await page.setInputFiles('[data-testid=file-input]', 'test/fixtures/report-a.pdf');
  await page.waitForSelector('text=We found', { timeout: 25000 });
  await page.click('text=Confirm & Build My Body');
  await page.waitForSelector('[data-testid=layer-normal]', { timeout: 20000 });
  await page.waitForTimeout(2500);
  await shot('1-body-normal');

  const gl = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    return c ? { w: c.width, h: c.height, ctx: !!c.getContext('webgl2') } : null;
  });
  console.log('CANVAS:', JSON.stringify(gl));

  for (const layer of ['fat', 'muscle', 'balance']) {
    await page.click(`[data-testid=layer-${layer}]`);
    await page.waitForTimeout(900);
    await shot(`2-layer-${layer}`);
  }
  await page.click('[data-testid=layer-normal]');
  await page.waitForTimeout(600);

  // Click into the body: aim at the left thigh region of the frame.
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.click(box.x + box.width / 2 + 34, box.y + box.height * 0.66);
  await page.waitForTimeout(900);
  const panel = await page.locator('[data-testid=region-panel]').count();
  console.log('REGION PANEL OPEN:', panel);
  if (panel) console.log('PANEL:', (await page.locator('[data-testid=region-panel]').innerText()).replace(/\n+/g, ' | '));
  await shot('3-region-selected');

  // Head should report itself as unmeasured.
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.13);
  await page.waitForTimeout(700);
  const head = await page.locator('[data-testid=region-panel]').count();
  if (head) console.log('HEAD PANEL:', (await page.locator('[data-testid=region-panel]').innerText()).replace(/\n+/g, ' | '));
  await shot('4-unmeasured-region');

  for (const v of ['back', 'left']) {
    await page.click(`[data-testid=view-${v}]`);
    await page.waitForTimeout(800);
    await shot(`5-view-${v}`);
  }
  await page.click('[data-testid=view-front]');
  await page.waitForTimeout(600);

  await page.click('[data-testid=provenance-toggle]');
  await page.waitForTimeout(500);
  await shot('6-provenance');
  console.log('PROVENANCE:', (await page.locator('text=Measured regions account for').innerText()));
  await page.click('[data-testid=provenance-toggle]');

  // Second person: a different body from different numbers.
  await page.click('nav >> text=reports');
  await page.waitForTimeout(400);
  await page.click('text=Upload report');
  await page.setInputFiles('[data-testid=file-input]', 'test/fixtures/report-b.pdf');
  await page.waitForSelector('text=different person', { timeout: 25000 });
  await page.click('text=Create a new profile');
  await page.waitForSelector('text=We found', { timeout: 20000 });
  await page.click('text=Confirm & Build My Body');
  await page.waitForSelector('[data-testid=layer-normal]', { timeout: 20000 });
  await page.waitForTimeout(2500);
  await shot('7-body-sahil');
  console.log('HEADLINE STRIP:', (await page.locator('main').innerText()).split('\n').slice(-12).join(' | '));

  console.log('CONSOLE ERRORS:', errors.length ? errors.slice(0, 5) : 'none');
  await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
