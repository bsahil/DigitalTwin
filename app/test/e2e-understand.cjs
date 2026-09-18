const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  const shot = async n => { await page.screenshot({ path: `/tmp/shots/u-${n}.png` }); console.log('shot', n); };

  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await page.setInputFiles('[data-testid=file-input]', 'test/fixtures/report-a.pdf');
  await page.waitForSelector('text=We found', { timeout: 25000 });
  await page.click('text=Confirm & Build My Body');
  await page.waitForSelector('[data-testid=layer-normal]', { timeout: 20000 });
  await page.waitForTimeout(2500);

  const dcBtn = await page.locator('[data-testid=data-check-button]').innerText();
  console.log('DATA CHECK BUTTON:', dcBtn.replace(/\n/g,' '));
  await shot('1-body-with-datacheck');

  // Data Check drawer
  await page.click('[data-testid=data-check-button]');
  await page.waitForSelector('[data-testid=data-check-panel]');
  await page.waitForTimeout(700);
  await shot('2-data-check');
  const flagTitles = await page.locator('[data-testid^=flag-] h3, [data-testid^=flag-] h4').allInnerTexts();
  console.log('FLAGS:', flagTitles.length);
  flagTitles.forEach(t => console.log('  -', t));
  const recs = await page.locator('text=What your report recommends').count();
  console.log('PROVIDER RECS SECTION:', recs);

  // Open a metric from a flag
  await page.click('[data-testid=flag-metric-fat_free_mass]');
  await page.waitForSelector('[data-testid=metric-panel]');
  await page.waitForTimeout(600);
  await shot('3-metric-from-flag');
  const panel = await page.locator('[data-testid=metric-panel]').innerText();
  const lower = panel.toLowerCase();
  console.log('PANEL SECTIONS:', ['what is this','why does it matter','your result','data check','connected to','don’t we know','how has it changed'].filter(s => lower.includes(s)).join(' | '));

  // Plain language toggle
  const before = await page.locator('[data-testid=metric-panel] section').first().innerText();
  await page.click('[data-testid=plain-language-toggle]');
  await page.waitForTimeout(400);
  const after = await page.locator('[data-testid=metric-panel] section').first().innerText();
  console.log('PLAIN LANGUAGE CHANGED:', before !== after);
  console.log('PLAIN TEXT:', after.split('\n').slice(-1)[0].slice(0,110));
  await shot('4-plain-language');

  // Follow a relationship
  await page.click('[data-testid=related-lean_mass]');
  await page.waitForTimeout(600);
  const h2 = await page.locator('[data-testid=metric-panel] h2').innerText();
  console.log('NAVIGATED TO:', h2);
  await shot('5-related-navigation');

  // Region -> explain
  await page.click('[data-testid=metric-panel] >> text=✕');
  await page.waitForTimeout(400);
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.click(box.x + box.width/2 + 30, box.y + box.height*0.66);
  await page.waitForTimeout(700);
  await page.click('[data-testid=explain-region]');
  await page.waitForSelector('[data-testid=metric-panel]');
  await page.waitForTimeout(600);
  console.log('EXPLAIN REGION OPENED:', await page.locator('[data-testid=metric-panel] h2').innerText());
  await shot('6-explain-region');

  // Headline metric -> body fat, should carry the BMI divergence flag
  await page.click('[data-testid=headline-fat_percentage]');
  await page.waitForTimeout(700);
  const bf = await page.locator('[data-testid=metric-panel]').innerText();
  console.log('BODY FAT PANEL HAS DATA CHECK:', bf.toLowerCase().includes('data check'));
  console.log('BODY FAT HAS MISSING DATA:', bf.includes('Blood lipid panel') || bf.includes('Fasting blood glucose'));
  await shot('7-body-fat-metric');

  console.log('CONSOLE ERRORS:', errors.length ? errors.slice(0,5) : 'none');
  await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
