const { chromium } = require('playwright');
const URL = 'https://lasertagc4-debug.github.io/lasertagc4-prototyp/';

(async () => {
  const b = await chromium.launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
  });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['microphone'] });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  pg.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });

  const r = await pg.goto(URL, { waitUntil: 'networkidle', timeout: 90000 });
  console.log('HTTP:', r.status());
  await pg.waitForTimeout(2000);

  console.log('przycisk w hero:', await pg.locator('#voice-open').isVisible());
  console.log('endpoint z produkcji:', await pg.evaluate(() => window.LT_VOICE_ENDPOINT || '(brak)'));

  await pg.locator('#voice-open').click();
  await pg.waitForTimeout(500);
  await pg.locator('#voice-start').click();
  await pg.waitForTimeout(3200);
  console.log('nagrywa:', await pg.locator('#voice-recording').isVisible());
  await pg.locator('#voice-stop').click();
  await pg.waitForTimeout(1200);
  console.log('odsłuch:', await pg.locator('#voice-review').isVisible());

  await pg.fill('#voice-name', 'Test Produkcja');
  await pg.fill('#voice-phone', '600 100 200');
  await pg.locator('#voice-send').click();
  await pg.waitForTimeout(16000);

  const done = await pg.locator('#voice-done').isVisible();
  const err = await pg.locator('#voice-error').isVisible();
  if (done) {
    console.log('>>> SUKCES PRODUKCJA — zgłoszenie:', await pg.locator('#voice-ticket').innerText());
  } else if (err) {
    console.log('>>> BŁĄD:', await pg.locator('#voice-error-title').innerText(), '|', await pg.locator('#voice-error-msg').innerText());
  }
  await pg.locator('.voice-card').screenshot({ path: 'shots/prod-voice-done.png' });

  const m = await b.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true, deviceScaleFactor:2, permissions:['microphone'] });
  const mp = await m.newPage();
  await mp.goto(URL, { waitUntil:'networkidle' });
  await mp.waitForTimeout(1500);
  const sw = await mp.evaluate(() => document.documentElement.scrollWidth);
  console.log('mobile:', sw, sw <= 391 ? 'OK' : 'PRZELEW');
  await mp.locator('.hero-actions').screenshot({ path:'shots/prod-hero-mobile.png' });

  console.log('błędy JS:', errs.length ? errs.join(' | ') : 'brak');
  await b.close();
})();
