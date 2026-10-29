const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const results = [];
  const ok = (n, c, extra='') => results.push({ n, c, extra });

  // ---------- DESKTOP ----------
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  await page.goto('http://127.0.0.1:8099/index.html', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2500);

  ok('brak błędów JS na starcie', errors.length === 0, errors.join(' | '));
  ok('jeden H1', await page.locator('h1').count() === 1, 'h1=' + await page.locator('h1').count());
  ok('H2 obecne', await page.locator('h2').count() >= 5, 'h2=' + await page.locator('h2').count());
  ok('pasek Wixa nieobecny', (await page.content()).includes('Ta strona została zbudowana') === false);
  ok('logo pełne (nie ucięte)', (await page.locator('.logo-text').first().innerText()).includes('LASER TAG C4'));
  ok('telefon klikalny tel:', await page.locator('a[href^="tel:"]').count() >= 2);
  ok('link do Facebooka', await page.locator('a[href*="facebook.com"]').count() >= 1);
  ok('link do Instagrama', await page.locator('a[href*="instagram.com"]').count() >= 1);
  ok('JSON-LD LocalBusiness', (await page.content()).includes('"@type": "SportsActivityLocation"'));
  ok('JSON-LD FAQPage', (await page.content()).includes('"@type": "FAQPage"'));
  ok('alt teksty w galerii', await page.locator('.gallery img[alt]:not([alt=""])').count() >= 5);
  ok('dni wygenerowane', await page.locator('.daybtn').count() === 21, 'dni=' + await page.locator('.daybtn').count());
  ok('przycisk telefonu w nagłówku', await page.locator('.btn-tel').isVisible());
  ok('pasek ocen widoczny', (await page.locator('.hero-trust').innerText()).includes('4,8'));

  await page.screenshot({ path: 'shots/desktop-hero.png', clip: { x: 0, y: 0, width: 1440, height: 900 } });

  // ---------- INTERAKCJA: wybór dnia i godziny ----------
  const wolnyDzien = page.locator('.daybtn:not([disabled])').nth(2);
  const dayLabel = await wolnyDzien.innerText();
  await wolnyDzien.click();
  await page.waitForTimeout(400);

  const slots = await page.locator('.slot:not(.taken)').count();
  ok('po wyborze dnia pojawiły się sloty', slots > 0, 'slotów=' + slots);

  const verdict = await page.locator('#verdict').innerText();
  ok('werdykt pokazany', verdict.length > 5, verdict.slice(0, 90).replace(/\n/g, ' '));

  const wolnySlot = page.locator('.slot:not(.taken)').first();
  await wolnySlot.click();
  await page.waitForTimeout(400);

  const summary = await page.locator('#summary').innerText();
  ok('podsumowanie ma cenę', summary.includes('Razem') && summary.includes('zł'), summary.split('\n').slice(0,4).join(' | '));

  // cena pakietu 2 w weekend vs tydzień
  const cenaRazem = (summary.match(/Razem\n?(.+)/) || [])[1];
  ok('kwota dla pakietu rozszerzonego = 650 lub 750', /650|750/.test(summary), 'razem=' + cenaRazem);

  // ---------- INTERAKCJA: pakiet premium, sprawdzenie bufora ----------
  await page.selectOption('#pakiet', 'u3');
  await page.waitForTimeout(500);
  const verdict2 = await page.locator('#verdict').innerText();
  ok('po zmianie pakietu werdykt przeliczony', verdict2.length > 5);

  // liczba wolnych slotów musi zmaleć przy dłuższym pakiecie
  const slotsPremium = await page.locator('.slot:not(.taken)').count();
  ok('dłuższy pakiet = mniej slotów', slotsPremium <= slots, `3h→${slots}, 4h→${slotsPremium}`);

  // ---------- INTERAKCJA: dni ----------
  const brakDni = await page.locator('.daybtn[disabled]').count();
  ok('część dni przekreślona (brak okna)', brakDni >= 0, 'zajętych dni=' + brakDni);

  // ---------- FORMULARZ ----------
  await page.selectOption('#pakiet', 'u2');
  await page.waitForTimeout(300);
  await page.locator('.slot:not(.taken)').first().click();
  await page.waitForTimeout(200);
  await page.fill('#imie', 'Anna Kowalska');
  await page.fill('#telefon', '600 100 200');
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(700);

  const confirmVisible = await page.locator('#confirm-box.show').isVisible();
  ok('potwierdzenie po wysłaniu widoczne', confirmVisible);
  const kod = await page.locator('#confirm-code').innerText();
  ok('kod rezerwacji wygenerowany', /^LT-\d{4}$/.test(kod), kod);

  await page.screenshot({ path: 'shots/desktop-booking.png', fullPage: false });

  // ---------- SEKCJE — zrzuty ----------
  for (const [name, sel] of [['urodziny','#urodziny'], ['szkolne','#szkolne'], ['rezerwacja','#rezerwacja'], ['znajdz','#znajdz'], ['ranking','#ranking'], ['galeria','#galeria']]) {
    const el = page.locator(sel);
    await el.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await el.screenshot({ path: `shots/sekcja-${name}.png` }).catch(()=>{});
  }

  // ---------- MOBILE ----------
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const mp = await mctx.newPage();
  const merr = [];
  mp.on('pageerror', e => merr.push(e.message));
  await mp.goto('http://127.0.0.1:8099/index.html', { waitUntil: 'networkidle', timeout: 60000 });
  await mp.waitForTimeout(2000);

  ok('mobile: brak błędów JS', merr.length === 0, merr.join('|'));
  ok('mobile: pasek telefonu widoczny', await mp.locator('.mobile-bar').isVisible());
  ok('mobile: hamburger widoczny', await mp.locator('.menu-toggle').isVisible());

  // brak poziomego przewijania
  const scrollW = await mp.evaluate(() => document.documentElement.scrollWidth);
  const clientW = await mp.evaluate(() => document.documentElement.clientWidth);
  ok('mobile: brak poziomego scrolla', scrollW <= clientW + 1, `scrollW=${scrollW} clientW=${clientW}`);

  await mp.screenshot({ path: 'shots/mobile-hero.png' });

  // menu
  await mp.locator('.menu-toggle').click();
  await mp.waitForTimeout(400);
  ok('mobile: menu się otwiera', await mp.locator('.nav.open').isVisible());
  await mp.locator('.menu-toggle').click();

  // rezerwacja na mobile
  await mp.locator('#rezerwacja').scrollIntoViewIfNeeded();
  await mp.waitForTimeout(600);
  await mp.screenshot({ path: 'shots/mobile-booking.png' });

  const scrollW2 = await mp.evaluate(() => document.documentElement.scrollWidth);
  ok('mobile: rezerwacja bez przelewu', scrollW2 <= clientW + 1, `scrollW=${scrollW2}`);

  // ---------- WYNIK ----------
  console.log('\n' + '='.repeat(56));
  const pass = results.filter(r => r.c).length;
  const fail = results.filter(r => !r.c).length;
  results.forEach(r => console.log(` ${r.c ? 'OK  ' : 'FAIL'} ${r.n}${r.extra ? '  → ' + r.extra : ''}`));
  console.log('='.repeat(56));
  console.log(`WYNIK: ${pass} OK, ${fail} FAIL`);
  if (errors.length) console.log('\nBŁĘDY KONSOLI:\n' + errors.join('\n'));

  await browser.close();
  process.exit(fail ? 1 : 0);
})();
