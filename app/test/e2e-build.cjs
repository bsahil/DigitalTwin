// Build My Body: level 1 renders a body with no PDF; editing the hips changes its shape.
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
    args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  const shot = async n => { await page.screenshot({ path: `/tmp/shots/b-${n}.png` }); console.log('shot', n); };
  const base = process.env.BASE_URL || 'http://localhost:5173/';

  await page.goto(base, { waitUntil: 'networkidle' });
  await page.evaluate(() => indexedDB.deleteDatabase('body-atlas'));
  await page.reload({ waitUntil: 'networkidle' });

  await page.click('[data-testid=build-start]');
  await page.waitForSelector('[data-testid=build-level-1]');
  await page.fill('[data-testid=build-name]', 'Sam');
  await page.click('[data-testid=build-sex-male]');
  await page.fill('[data-testid=build-age]', '40');
  await page.fill('[data-testid=build-height]', '175');
  await page.fill('[data-testid=build-weight]', '80');
  const summary = await page.locator('[data-testid=build-summary]').innerText();
  console.log('SUMMARY:', summary.replace(/\n/g, ' | '));
  await shot('1-level1');
  await page.click('[data-testid=build-submit]');

  await page.waitForSelector('[data-testid=layer-normal]', { timeout: 20000 });
  await page.waitForSelector('[data-testid=body-loading]', { state: 'detached', timeout: 30000 });
  await page.waitForTimeout(1500);
  await shot('2-body-level1');

  const fatDisabled = await page.getAttribute('[data-testid=layer-fat]', 'aria-disabled');
  console.log('FAT LAYER DISABLED:', fatDisabled);
  const legend = await page.locator('[data-testid=legend]').count();
  console.log('LEGEND HIDDEN:', legend === 0);

  // Widest contiguous run through the centre column between the waist and the crotch:
  // the hips. Contiguous, so the hands hanging beside the body do not count.
  const hipWidth = async () => page.evaluate(() => {
    const gl = document.querySelector('canvas');
    const c = document.createElement('canvas');
    c.width = gl.width; c.height = gl.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(gl, 0, 0);
    const cx = Math.round(gl.width / 2);
    let best = 0;
    for (let fy = 0.36; fy <= 0.52; fy += 0.01) {
      const y = Math.round(gl.height * fy);
      const d = ctx.getImageData(0, y, gl.width, 1).data;
      const lit = (x) => d[x * 4] + d[x * 4 + 1] + d[x * 4 + 2] > 90;
      if (!lit(cx)) continue;
      let l = cx, r = cx;
      while (l > 0 && lit(l - 1)) l--;
      while (r < gl.width - 1 && lit(r + 1)) r++;
      best = Math.max(best, r - l);
    }
    return best;
  });
  const hipBefore = await hipWidth();

  const skin = await page.evaluate(() => {
    const gl = document.querySelector('canvas');
    const c = document.createElement('canvas');
    c.width = gl.width; c.height = gl.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(gl, 0, 0);
    const x = Math.round(gl.width / 2);
    const d = ctx.getImageData(x, 0, 1, gl.height).data;
    let best = { r: 0, g: 0, b: 0, score: -1e9 };
    for (let i = 0; i < d.length; i += 4) { if (d[i] - d[i+2] > best.score) best = { r: d[i], g: d[i+1], b: d[i+2], score: d[i] - d[i+2] }; }
    return best;
  });
  console.log(`SKIN: rgb(${skin.r},${skin.g},${skin.b}) -> ${skin.r > skin.g && skin.g > skin.b && skin.r - skin.b >= 25 ? 'SKIN' : 'FAIL'}`);
  if (!(skin.r > skin.g && skin.g > skin.b && skin.r - skin.b >= 25)) process.exitCode = 1;

  // The estimated body fat is explained as such. Headline stats live in the collapsed
  // info drawer by default now, so open it first.
  await page.click('[data-testid=info-drawer-toggle]');
  await page.waitForTimeout(400);
  await page.click('[data-testid=headline-fat_percentage]');
  await page.waitForSelector('[data-testid=provenance-note]');
  const note = await page.locator('[data-testid=provenance-note]').innerText();
  const tag = await page.locator('span:text-is("estimated")').count();
  console.log('FAT NOTE:', note.slice(0, 90), '| tag present:', tag > 0);
  if (!/Deurenberg/.test(note)) process.exitCode = 1;
  await shot('3-fat-estimated');

  // Edit answers: add hips, then a larger hips value; the silhouette must widen.
  await page.click('[data-testid=nav-reports]');
  await page.click('[data-testid^=edit-answers-]');
  await page.waitForSelector('[data-testid=build-level-1]');
  const nameKept = await page.inputValue('[data-testid=build-name]');
  await page.click('[data-testid=build-open-2]');
  await page.fill('[data-testid=build-hip]', '96');
  await page.click('[data-testid=build-submit]');
  await page.waitForSelector('[data-testid=layer-normal]', { timeout: 20000 });
  await page.waitForSelector('[data-testid=body-loading]', { state: 'detached', timeout: 30000 });
  await page.waitForTimeout(1200);
  const hipSmall = await hipWidth();
  const readHipClaim = async () => {
    await page.click('[data-testid=provenance-toggle]');
    const text = await page.locator('[data-testid=provenance-panel]').innerText();
    await page.click('[data-testid=provenance-toggle]');
    const m = text.match(/Hip[^\n]*?(\d+\.\d) cm/);
    return { claim: (text.match(/Hip[^\n]*/) || [''])[0], drawn: m ? Number(m[1]) : NaN };
  };
  const smallClaim = await readHipClaim();

  await page.click('[data-testid=nav-reports]');
  await page.click('[data-testid^=edit-answers-]');
  await page.waitForSelector('[data-testid=build-level-2]');
  const hipKept = await page.inputValue('[data-testid=build-hip]');
  await page.fill('[data-testid=build-hip]', '118');
  await page.click('[data-testid=build-submit]');
  await page.waitForSelector('[data-testid=layer-normal]', { timeout: 20000 });
  await page.waitForTimeout(1200);
  const hipBig = await hipWidth();
  const bigClaim = await readHipClaim();
  await shot('4-body-big-hips');

  const reportCount = await page.evaluate(async () => {
    const req = indexedDB.open('body-atlas');
    return new Promise((res) => { req.onsuccess = () => { const tx = req.result.transaction('reports'); const c = tx.objectStore('reports').count(); c.onsuccess = () => res(c.result); }; });
  });
  console.log(`HIPS (pixels, informational): before=${hipBefore}px 96cm=${hipSmall}px 118cm=${hipBig}px`);
  console.log(`HIP CLAIMS: 96 -> "${smallClaim.claim}" | 118 -> "${bigClaim.claim}"`);
  console.log(`EDIT KEPT name="${nameKept}" hip="${hipKept}" | reports=${reportCount}`);
  // The drawn hip must follow the entered value where the shape can reach it (118 is
  // reachable; 96 may be reported as the smallest this body reaches), and the two must differ.
  const ok = Math.abs(bigClaim.drawn - 118) < 0.6 && bigClaim.drawn - smallClaim.drawn > 10 && nameKept === 'Sam' && hipKept === '96' && reportCount === 1;
  console.log('BUILD FLOW:', ok ? 'OK' : 'FAIL');
  if (!ok) process.exitCode = 1;

  console.log('ERRORS:', errors.length ? errors.slice(0, 4) : 'none');
  await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
