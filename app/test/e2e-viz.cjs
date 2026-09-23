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
  await page.waitForSelector('[data-testid=body-loading]', { state: 'detached', timeout: 30000 });
  await page.waitForTimeout(1500);
  await shot('1-normal');

  // The info drawer (headline stats + standouts) starts collapsed, so the body view
  // gets most of the screen; opening it must visibly shrink the canvas, proving the
  // space actually moved rather than the drawer floating over the view.
  const canvasHeight = () => page.locator('canvas').evaluate((c) => c.getBoundingClientRect().height);
  const collapsedH = await canvasHeight();
  await page.click('[data-testid=info-drawer-toggle]');
  await page.waitForTimeout(400);
  const expandedH = await canvasHeight();
  console.log(`INFO DRAWER: collapsed canvas=${collapsedH.toFixed(0)}px expanded=${expandedH.toFixed(0)}px -> ${collapsedH > expandedH ? 'OK, collapsed gives the body more room' : 'FAIL: collapsing did not grow the view'}`);
  if (!(collapsedH > expandedH)) process.exitCode = 1;
  await shot('1b-drawer-expanded');
  await page.click('[data-testid=info-drawer-toggle]');
  // The canvas resize on collapse clears the drawing buffer until the next frame;
  // wait for two real animation frames (not just a timer) before reading pixels.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(400);

  // Skin, not blue: the trunk pixel in the body layer must be warm.
  // The centre column crosses face, top, midriff, brief and legs; the warmest pixel must be skin.
  const scanColumn = async (fx) => page.evaluate(([fx]) => {
    const gl = document.querySelector('canvas');
    const c = document.createElement('canvas');
    c.width = gl.width; c.height = gl.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(gl, 0, 0);
    const x = Math.round(gl.width * fx);
    const d = ctx.getImageData(x, 0, 1, gl.height).data;
    let warm = { r: 0, g: 0, b: 0, score: -1e9 }, teal = { r: 0, g: 0, b: 0, ratio: 1e9 };
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i+1], b = d[i+2];
      if (r + g + b < 60) continue;
      if (r - b > warm.score) warm = { r, g, b, score: r - b };
      const ratio = r / Math.max(1, g);
      if (g > 80 && ratio < teal.ratio) teal = { r, g, b, ratio };
    }
    return { warm, teal };
  }, [fx]);
  const col = await scanColumn(0.5);
  const skin = col.warm;
  const skinOk = skin.r > skin.g && skin.g > skin.b && skin.r - skin.b >= 25;
  console.log(`SKIN PIXEL PROBE: rgb(${skin.r|0},${skin.g|0},${skin.b|0}) -> ${skinOk ? 'SKIN' : 'FAIL: not skin-coloured'}`);
  if (!skinOk) process.exitCode = 1;

  for (const l of ['fat','muscle','balance']) {
    await page.click(`[data-testid=layer-${l}]`);
    await page.waitForTimeout(1100);
    await shot(`2-${l}`);
    const legend = await page.locator('[data-testid=legend]').count();
    let txt = legend ? (await page.locator('[data-testid=legend]').innerText()).replace(/\n/g,' | ') : '(none)';
    console.log(`${l}: legend=${legend} ${txt}`);
  }

  // Hover label over the trunk.
  await page.click('[data-testid=layer-normal]');
  await page.waitForTimeout(600);
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.move(box.x + box.width/2, box.y + box.height*0.42);
  await page.waitForTimeout(700);
  const label = page.locator('[data-testid=hover-label]');
  console.log('HOVER LABEL:', await label.innerText(), '| opacity', await label.evaluate(e => getComputedStyle(e).opacity));
  await shot('3-hover');

  // Drag gate: an orbit drag that releases over empty space must not close the selection.
  await page.click('[data-testid=layer-normal]');
  await page.waitForTimeout(400);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.42);
  await page.waitForTimeout(500);
  const openBefore = await page.locator('[data-testid=region-panel]').count();
  const cb = await page.locator('canvas').boundingBox();
  await page.mouse.move(cb.x + 160, cb.y + cb.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(cb.x + 230, cb.y + cb.height * 0.5 + 20, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const openAfter = await page.locator('[data-testid=region-panel]').count();
  console.log(`DRAG GATE: panel open before=${openBefore} after drag=${openAfter} -> ${openBefore === 1 && openAfter === 1 ? 'OK' : 'FAIL: drag closed the selection'}`);
  if (!(openBefore === 1 && openAfter === 1)) process.exitCode = 1;
  console.log('REGION SHARES:', await page.locator('[data-testid=region-shares]').innerText());

  // Keyboard: focus the region list, step to the next region, Enter selects it.
  await page.locator('[data-testid=region-listbox]').focus();
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(300);
  const kbLabel = await page.locator('[data-testid=hover-label]').innerText();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  console.log('KEYBOARD: focus label =', JSON.stringify(kbLabel.slice(0, 40)), '| selected =', await page.locator('[data-testid=region-panel] h2').innerText());
  await page.keyboard.press('Escape');
  await page.click('[data-testid=region-panel] >> text=✕');
  await page.waitForTimeout(300);

  // Pixel probe: in the muscle layer the trunk must read as the solid teal core, not
  // a tinted grey shell. Teal has a low red:green ratio; the neutral slate does not.
  await page.click('[data-testid=view-front]');
  await page.click('[data-testid=layer-muscle]');
  await page.waitForTimeout(900);
  const teal = (await scanColumn(0.5)).teal;
  const ratio = teal.ratio;
  console.log(`MUSCLE PIXEL PROBE: rgb(${teal.r|0},${teal.g|0},${teal.b|0}) r/g=${ratio.toFixed(2)} -> ${ratio < 0.75 ? 'MUSCLE TINT VISIBLE' : 'FAIL: reads as skin'}`);
  if (ratio >= 0.75) process.exitCode = 1;

  await page.click('[data-testid=layer-normal]');
  await page.waitForTimeout(600);
  await page.click('[data-testid=view-left]');
  await page.waitForTimeout(900);
  await shot('4-side');

  // Skin tone picker changes the rendered skin.
  await page.click('[data-testid=view-front]');
  await page.click('[data-testid=skin-tone-6]');
  await page.waitForTimeout(700);
  const dark = (await scanColumn(0.5)).warm;
  console.log(`SKIN TONE 6: rgb(${dark.r|0},${dark.g|0},${dark.b|0}) darker than tone 3: ${dark.r < skin.r - 30}`);
  if (!(dark.r < skin.r - 30)) process.exitCode = 1;
  await shot('4b-tone-6');
  await page.click('[data-testid=skin-tone-3]');
  await page.waitForTimeout(400);

  // True scale: the figure must get smaller against a fixed 195 cm frame, and the
  // rule must mark this person's own height.
  await page.click('[data-testid=layer-normal]');
  await page.click('[data-testid=view-front]');
  await page.waitForTimeout(700);
  const figurePx = () => page.evaluate(() => {
    const gl = document.querySelector('canvas');
    const c = document.createElement('canvas');
    c.width = gl.width; c.height = gl.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(gl, 0, 0);
    const x = Math.round(gl.width / 2);
    const col = ctx.getImageData(x, 0, 1, gl.height).data;
    let top = -1, bottom = -1;
    for (let y = 0; y < gl.height; y++) {
      const i = y * 4;
      const lum = col[i] + col[i+1] + col[i+2];
      if (lum > 120) { if (top < 0) top = y; bottom = y; }
    }
    return bottom - top;
  });
  const fitPx = await figurePx();
  await page.click('[data-testid=scale-true]');
  await page.waitForTimeout(700);
  const truePx = await figurePx();
  const marker = page.locator('[data-testid=height-marker]');
  const markerText = await marker.innerText();
  const markerOpacity = await marker.evaluate(e => getComputedStyle(e).opacity);
  const shrink = truePx / fitPx;
  console.log(`TRUE SCALE: fit=${fitPx}px true=${truePx}px ratio=${shrink.toFixed(2)} marker="${markerText}" opacity=${markerOpacity} -> ${shrink > 0.7 && shrink < 0.95 && markerOpacity === '1' && /cm$/.test(markerText) ? 'OK' : 'FAIL'}`);
  if (!(shrink > 0.7 && shrink < 0.95 && markerOpacity === '1')) process.exitCode = 1;
  await shot('5-true-scale');
  await page.click('[data-testid=scale-fit]');
  await page.waitForTimeout(500);
  console.log('HEIGHT MARKER HIDDEN IN FIT:', await marker.evaluate(e => getComputedStyle(e).opacity) === '0');

  console.log('ERRORS:', errors.length ? errors.slice(0,4) : 'none');
  await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
