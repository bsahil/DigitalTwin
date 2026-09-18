const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
    args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  const shot = async n => { await page.screenshot({ path: `/tmp/shots/v-${n}.png` }); console.log('shot', n); };

  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await page.setInputFiles('[data-testid=file-input]', 'test/fixtures/report-a.pdf');
  await page.waitForSelector('text=We found', { timeout: 25000 });
  await page.click('text=Confirm & Build My Body');
  await page.waitForSelector('[data-testid=layer-normal]', { timeout: 20000 });
  await page.waitForTimeout(2500);
  await shot('1-normal');

  for (const l of ['fat','muscle','balance','inside']) {
    await page.click(`[data-testid=layer-${l}]`);
    await page.waitForTimeout(1100);
    await shot(`2-${l}`);
    const legend = await page.locator('[data-testid=legend]').count();
    let txt = legend ? (await page.locator('[data-testid=legend]').innerText()).replace(/\n/g,' | ') : '(none)';
    console.log(`${l}: legend=${legend} ${txt}`);
  }

  // Hover label over the trunk.
  await page.click('[data-testid=layer-inside]');
  await page.waitForTimeout(600);
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.move(box.x + box.width/2, box.y + box.height*0.42);
  await page.waitForTimeout(700);
  const label = page.locator('[data-testid=hover-label]');
  console.log('HOVER LABEL:', await label.innerText(), '| opacity', await label.evaluate(e => getComputedStyle(e).opacity));
  await shot('3-inside-hover');

  await page.click('[data-testid=view-left]');
  await page.waitForTimeout(900);
  await shot('4-inside-side');

  console.log('ERRORS:', errors.length ? errors.slice(0,4) : 'none');
  await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
