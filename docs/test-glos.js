const { chromium } = require('playwright');
const URL = 'http://127.0.0.1:8099/index.html';

(async () => {
  const b = await chromium.launch({
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required'
    ]
  });
  const ctx = await b.newContext({
    viewport: { width: 1440, height: 900 },
    permissions: ['microphone']
  });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  pg.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });

  await pg.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });

  // wskazujemy pośrednika
  await pg.evaluate(() => { window.LT_VOICE_ENDPOINT = 'http://127.0.0.1:8788/nagranie'; });

  // 1. przycisk jest w hero, obok dwóch pozostałych
  const btn = pg.locator('#voice-open');
  console.log('przycisk widoczny:', await btn.isVisible());
  console.log('tekst przycisku:', (await btn.innerText()).trim().replace(/\n/g,' '));
  const heroBtns = await pg.locator('.hero-actions .btn').count();
  console.log('przycisków w hero:', heroBtns, heroBtns === 3 ? '(OK — 3 w rzędzie)' : '(NIE 3!)');
  await pg.locator('.hero-actions').screenshot({ path: 'shots/voice-hero.png' });

  // 2. otwarcie okna
  await btn.click();
  await pg.waitForTimeout(400);
  console.log('okno otwarte:', await pg.locator('#voice-modal').isVisible());
  console.log('wsparcie:', (await pg.locator('#voice-support').innerText()).trim());
  await pg.locator('.voice-card').screenshot({ path: 'shots/voice-idle.png' });

  // 3. nagrywanie
  await pg.locator('#voice-start').click();
  await pg.waitForTimeout(2600);
  const nagrywa = await pg.locator('#voice-recording').isVisible();
  console.log('stan nagrywania:', nagrywa);
  console.log('timer:', await pg.locator('#voice-timer').innerText());
  const slupki = await pg.locator('#voice-wave i').count();
  console.log('słupki wizualizacji:', slupki);
  await pg.locator('.voice-card').screenshot({ path: 'shots/voice-recording.png' });

  // 4. zatrzymanie → odsłuch
  await pg.locator('#voice-stop').click();
  await pg.waitForTimeout(1200);
  console.log('stan odsłuchu:', await pg.locator('#voice-review').isVisible());
  const audioSrc = await pg.locator('#voice-audio').getAttribute('src');
  console.log('podgląd audio:', audioSrc ? 'utworzony (blob)' : 'BRAK');
  const rozmiar = await pg.evaluate(() => {
    const a = document.getElementById('voice-audio');
    return a.duration ? Math.round(a.duration * 10) / 10 : 'brak metadanych';
  });
  console.log('czas nagrania z pliku:', rozmiar);
  await pg.locator('.voice-card').screenshot({ path: 'shots/voice-review.png' });

  // 5. wysyłka na Telegram
  await pg.fill('#voice-name', 'Anna Test');
  await pg.fill('#voice-phone', '600 100 200');
  await pg.locator('#voice-send').click();
  await pg.waitForTimeout(4000);

  const done = await pg.locator('#voice-done').isVisible();
  const err = await pg.locator('#voice-error').isVisible();
  if (done) {
    console.log('WYNIK: SUKCES — numer zgłoszenia:', await pg.locator('#voice-ticket').innerText());
  } else if (err) {
    console.log('WYNIK: BŁĄD —', await pg.locator('#voice-error-title').innerText(), '|', await pg.locator('#voice-error-msg').innerText());
  } else {
    console.log('WYNIK: nieokreślony');
  }
  await pg.locator('.voice-card').screenshot({ path: 'shots/voice-done.png' });

  // 6. mobilny widok przycisku
  const m = await b.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
    permissions: ['microphone']
  });
  const mp = await m.newPage();
  await mp.goto(URL, { waitUntil: 'networkidle' });
  await mp.waitForTimeout(1200);
  const sw = await mp.evaluate(() => document.documentElement.scrollWidth);
  console.log('mobile scrollWidth:', sw, sw <= 391 ? '(brak przelewu)' : '(PRZELEW!)');
  await mp.locator('.hero-actions').screenshot({ path: 'shots/voice-hero-mobile.png' });
  await mp.locator('#voice-open').click();
  await mp.waitForTimeout(500);
  await mp.screenshot({ path: 'shots/voice-mobile.png' });

  console.log('\nbłędy JS:', errs.length ? errs.join('\n') : 'brak');
  await b.close();
})();
