// node test/preview-shot.cjs "<query>" <name>  — screenshots /preview/body.html with the query.
const { chromium } = require('playwright');
(async () => {
  const [query = '', name = 'preview'] = process.argv.slice(2);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
    args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 700, height: 900 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); else if (m.text().startsWith('measure')) console.log(m.text().slice(0, 400)); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto('http://localhost:5173/preview/body.html?' + query, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.ready === true, null, { timeout: 30000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `/tmp/shots/${name}.png` });
  console.log('shot', name, 'errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
