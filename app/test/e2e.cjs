const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  const shot = async n => { await page.screenshot({ path: `/tmp/shots/${n}.png`, fullPage: false }); console.log('shot', n); };

  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await shot('1-upload');

  // Report A
  await page.setInputFiles('[data-testid=file-input]', 'test/fixtures/report-a.pdf');
  await page.waitForTimeout(600);
  await shot('2-processing');
  await page.waitForSelector('text=We found', { timeout: 20000 });
  await page.waitForTimeout(400);
  await shot('3-verify');

  console.log('HEADLINE:', await page.locator('h1').first().innerText());
  console.log('HEIGHT:', await page.locator('[data-testid=height-input]').inputValue());
  console.log('ROWS:', await page.locator('tbody tr').count());
  const weight = await page.locator('[data-testid=row-weight]').innerText();
  console.log('WEIGHT ROW:', weight.replace(/\n/g, ' | '));
  const ffm = await page.locator('[data-testid=row-fat_free_mass]').innerText();
  console.log('FFM ROW:', ffm.replace(/\n/g, ' | '));
  const lean = await page.locator('[data-testid=row-lean_mass]').innerText();
  console.log('LEAN ROW:', lean.replace(/\n/g, ' | '));

  await page.click('text=Confirm & Build My Body');
  await page.waitForSelector('text=Your data is ready', { timeout: 15000 });
  await page.waitForTimeout(500);
  await shot('4-ready');

  // Report B — different person
  await page.click('text=Upload another report');
  await page.waitForSelector('[data-testid=file-input]', { state: 'attached' });
  await page.setInputFiles('[data-testid=file-input]', 'test/fixtures/report-b.pdf');
  await page.waitForSelector('text=different person', { timeout: 20000 });
  await page.waitForTimeout(400);
  await shot('5-subject-check');
  console.log('SUBJECT CHECK SHOWN for second person');

  await page.click('text=Create a new profile');
  await page.waitForSelector('text=We found', { timeout: 15000 });
  console.log('B ROWS:', await page.locator('tbody tr').count());
  console.log('B HEIGHT:', await page.locator('[data-testid=height-input]').inputValue());
  console.log('B has muscle_control row:', await page.locator('[data-testid=row-muscle_control]').count());
  await page.click('text=Confirm & Build My Body');
  await page.waitForSelector('text=Your data is ready', { timeout: 15000 });
  await page.waitForTimeout(400);

  // Reports library + persistence
  await page.click('nav >> text=Reports');
  await page.waitForTimeout(600);
  await shot('6-reports');
  console.log('PROFILES:', await page.locator('[data-testid=profile-switcher] option').allInnerTexts());

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const persisted = await page.locator('text=body scan').count();
  console.log('REPORTS AFTER RELOAD:', persisted);
  await shot('7-after-reload');

  console.log('CONSOLE ERRORS:', errors.length ? errors : 'none');
  await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
