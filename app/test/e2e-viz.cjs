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

  // Pixel probe: in the muscle layer the trunk must read as the solid teal core, not
  // a tinted grey shell. Teal has a low red:green ratio; the neutral slate does not.
  await page.click('[data-testid=view-front]');
  await page.click('[data-testid=layer-muscle]');
  await page.waitForTimeout(900);
  const probe = await page.evaluate(() => {
    const gl = document.querySelector('canvas');
    const c = document.createElement('canvas');
    c.width = gl.width; c.height = gl.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(gl, 0, 0);
    const cx = Math.round(gl.width / 2), cy = Math.round(gl.height * 0.42);
    const d = ctx.getImageData(cx - 3, cy - 3, 7, 7).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i+1]; b += d[i+2]; n++; }
    return { r: r / n, g: g / n, b: b / n };
  });
  const ratio = probe.r / Math.max(1, probe.g);
  console.log(`MUSCLE PIXEL PROBE: rgb(${probe.r|0},${probe.g|0},${probe.b|0}) r/g=${ratio.toFixed(2)} -> ${ratio < 0.6 ? 'TEAL CORE VISIBLE' : 'FAIL: reads as tinted shell'}`);
  if (ratio >= 0.6) process.exitCode = 1;

  await page.click('[data-testid=layer-inside]');
  await page.waitForTimeout(600);
  await page.click('[data-testid=view-left]');
  await page.waitForTimeout(900);
  await shot('4-inside-side');

  console.log('ERRORS:', errors.length ? errors.slice(0,4) : 'none');
  await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
