const { chromium } = require('playwright');
const URL = 'https://lasertagc4-debug.github.io/lasertagc4-prototyp/';
(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport:{width:1440,height:900} });
  const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  pg.on('console', m => { if (m.type()==='error') errs.push('CONSOLE: ' + m.text()); });

  const res = await pg.goto(URL, { waitUntil:'networkidle', timeout:90000 });
  console.log('HTTP status:', res.status());
  await pg.waitForTimeout(2500);

  console.log('tytuł:', await pg.title());
  console.log('H1:', await pg.locator('h1').innerText());
  console.log('dni w pasku:', await pg.locator('.daybtn').count());
  console.log('oceny widoczne:', (await pg.locator('.hero-trust').innerText()).replace(/\n/g,' | '));

  // TEST SILNIKA NA ŻYWO
  const idx = await pg.evaluate(() => [...document.querySelectorAll('.daybtn')].findIndex((b,i)=> !b.disabled && i>=1));
  await pg.locator('.daybtn').nth(idx).click();
  await pg.waitForTimeout(600);
  const sloty = await pg.locator('.slot').count();
  const wolne = await pg.locator('.slot:not(.taken)').count();
  console.log(`po kliknięciu dnia: slotów=${sloty}, wolnych=${wolne}`);

  await pg.locator('.slot:not(.taken)').first().click();
  await pg.waitForTimeout(400);
  const suma = await pg.locator('#summary').innerText();
  console.log('cena policzona:', /Razem/.test(suma) ? 'TAK' : 'NIE');
  console.log('progress:', await pg.locator('.progress-text').innerText());

  // formularz
  await pg.fill('#imie', 'Test Audytu');
  await pg.fill('#telefon', '600 100 200');
  await pg.locator('button[type="submit"]').click();
  await pg.waitForTimeout(700);
  console.log('potwierdzenie:', await pg.locator('#confirm-box.show').isVisible());
  console.log('kod:', await pg.locator('#confirm-code').innerText());

  await pg.screenshot({ path:'live-desktop.png' });

  // mobile
  const m = await b.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true, deviceScaleFactor:2 });
  const mp = await m.newPage();
  await mp.goto(URL, { waitUntil:'networkidle', timeout:90000 });
  await mp.waitForTimeout(2000);
  const sw = await mp.evaluate(()=>document.documentElement.scrollWidth);
  console.log('mobile scrollWidth:', sw, sw<=391?'(brak przelewu)':'(PRZELEW!)');
  console.log('mobile pasek telefonu:', await mp.locator('.mobile-bar').isVisible());
  await mp.screenshot({ path:'live-mobile.png' });

  console.log('\nbłędy JS:', errs.length ? errs.join('\n') : 'brak');
  await b.close();
})();
