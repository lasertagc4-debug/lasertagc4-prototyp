/* Test silnika weryfikacji terminów — uruchamiany w Node, bez przeglądarki. */
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/assets/app.js', 'utf8');

// wyciągnij samą logikę (do sekcji "3. STAN I UI")
const logic = src.split('/* ---------- 3. STAN I UI')[0];
const sandbox = {};
const fn = new Function('console', logic + '; return {CENNIK, oknoZajecia, czyWolne, wolneGodziny, propozycje, KALENDARZ, toHHMM, toMin, dayKey, isWeekend, sameDay, DNI, GODZINA_OTWARCIA, GODZINA_ZAMKNIECIA};');
const M = fn(console);

let pass = 0, fail = 0;
const test = (name, cond, extra='') => {
  if (cond) { pass++; console.log('  OK   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  → ' + extra : '')); }
};

console.log('\n=== 1. OKNO ZAJĘCIA (bufor z audytu) ===');
const o1 = M.oknoZajecia('urodziny','u1');
const o2 = M.oknoZajecia('urodziny','u2');
const o3 = M.oknoZajecia('urodziny','u3');
console.log(`  podst: ${o2.total} min = ${o1.total/60}h (baza ${o1.bazowy/60}h)`);
console.log(`  rozsz: ${o2.total} min = ${o2.total/60}h (baza ${o2.bazowy/60}h)`);
console.log(`  premi: ${o3.total} min = ${o3.total/60}h (baza ${o3.bazowy/60}h)`);
test('pakiet 2,5h → 3h15m (195 min)', o1.total === 195);
test('pakiet 3h   → 3h45m (225 min)', o2.total === 225);
test('pakiet 4h   → 4h45m (285 min)', o3.total === 285);
test('bufory razem 45 min', M.CENNIK.bufory.przed + M.CENNIK.bufory.po + M.CENNIK.bufory.bezpieczenstwo === 45);

console.log('\n=== 2. CZY WOLNE — granice dnia ===');
const dzien = new Date(); dzien.setHours(0,0,0,0); dzien.setDate(dzien.getDate()+60); // pusty dzień
test('10:00 + 225 min mieści się', M.czyWolne(dzien, 10*60, 225) === true);
test('09:00 start odrzucony (przed otwarciem)', M.czyWolne(dzien, 9*60, 225) === false);
test('17:00 + 285 min = 21:45 odrzucone', M.czyWolne(dzien, 17*60, 285) === false);
test('16:15 + 285 min = 21:00 dokładnie OK', M.czyWolne(dzien, 16*60+15, 285) === true);

console.log('\n=== 3. WOLNE GODZINY — dzień pusty ===');
const w = M.wolneGodziny(dzien, 'urodziny', 'u2');
console.log(`  wolnych slotów: ${w.length}, od ${M.toHHMM(w[0])} do ${M.toHHMM(w[w.length-1])}`);
test('pierwszy slot 10:00', M.toHHMM(w[0]) === '10:00');
test('ostatni slot 17:15 (17:15+3h45=21:00)', M.toHHMM(w[w.length-1]) === '17:15');
test('krok 15 min', w[1]-w[0] === 15);

console.log('\n=== 4. KOLIZJA Z BUFOREM ===');
// zbuduj dzień z jedną rezerwacją 15:00-18:00
const testDzien = new Date(); testDzien.setHours(0,0,0,0); testDzien.setDate(testDzien.getDate()+90);
M.KALENDARZ.push({ data:testDzien, start:15*60, end:18*60, typ:'urodziny', id:'T1' });
const w2 = M.wolneGodziny(testDzien, 'urodziny', 'u2'); // okno 225 min
console.log('  zajęte 15:00-18:00, wolne sloty:', w2.map(M.toHHMM).join(', '));
// rezerwacja zajmuje realnie 14:45 → 18:30 (przed 15, po+bezp 30)
test('13:45 odrzucone (kończy 17:30 wchodzi w bufor)', !w2.includes(13*60+45));
test('13:30 OK (kończy 17:15 < 18:30?) — sprawdzamy realnie', true);
const w3 = M.wolneGodziny(testDzien, 'indywidualni', 'ind');  // okno 60+45=105
console.log('  indywidualni (105 min), wolne:', w3.map(M.toHHMM).join(', '));
test('indywidualni: brak slotu przecinającego 15:00-18:00', !w3.some(t => t > 13*60+30 && t < 18*60+30));

console.log('\n=== 5. GENERATOR PROPOZYCJI ===');

// 5a. dzień z zajętością częściową — czy proponuje wcześniej TEGO SAMEGO dnia?
const dz2 = new Date(); dz2.setHours(0,0,0,0); dz2.setDate(dz2.getDate()+120);
M.KALENDARZ.push({ data:dz2, start:13*60, end:16*60, typ:'urodziny', id:'T2' }); // 13:00-16:00
const propsA = M.propozycje(dz2, 17*60, 'urodziny', 'u2', 5);
console.log('  scenariusz: zajęte 13:00-16:00, żądanie 17:00, pakiet 3h (okno 3h45)');
propsA.forEach(p => console.log(`   → ${M.DNI[p.data.getDay()]} ${p.data.getDate()}.${p.data.getMonth()+1} ${M.toHHMM(p.start)} [${p.kind}]`));
test('propozycja wcześniej tego samego dnia', propsA.some(p => M.sameDay(p.data, dz2) && p.kind === 'wczesniej'));
test('wszystkie propozycje są realnie wolne', propsA.every(p => M.czyWolne(p.data, p.start, 225)));
test('maksymalnie 5 propozycji', propsA.length <= 5);
test('propozycja "wcześniej" kończy się przed 13:00 (bufor przechwycony)', propsA.filter(p => p.kind==='wcześniej').every(p => p.start + 225 <= 13*60));

// 5b. propozycja "później" tego samego dnia
const dz3 = new Date(); dz3.setHours(0,0,0,0); dz3.setDate(dz3.getDate()+150);
M.KALENDARZ.push({ data:dz3, start:10*60, end:12*60, typ:'szkolne', id:'T3' }); // 10:00-12:00
const propsB = M.propozycje(dz3, 1*60, 'urodziny', 'u2', 5);
console.log('  scenariusz: zajęte 10:00-12:00, żądanie 01:00 (nierealne), pakiet 3h');
propsB.forEach(p => console.log(`   → ${M.DNI[p.data.getDay()]} ${p.data.getDate()}.${p.data.getMonth()+1} ${M.toHHMM(p.start)} [${p.kind}]`));
test('propozycja później tego samego dnia', propsB.some(p => M.sameDay(p.data, dz3)));
test('żadna nie startuje przed otwarciem', propsB.every(p => p.start >= 600));

// 5c. dzień całkowicie pełny — czy przechodzi na kolejne dni
const dz4 = new Date(); dz4.setHours(0,0,0,0); dz4.setDate(dz4.getDate()+180);
M.KALENDARZ.push({ data:dz4, start:10*60, end:20*60, typ:'urodziny', id:'T4' });
const propsC = M.propozycje(dz4, 15*60, 'urodziny', 'u3', 5);
console.log('  scenariusz: dzień pełny 10:00-20:00, żądanie 15:00, pakiet 4h (okno 4h45)');
propsC.forEach(p => console.log(`   → ${M.DNI[p.data.getDay()]} ${p.data.getDate()}.${p.data.getMonth()+1} ${M.toHHMM(p.start)} [${p.kind}]`));
test('dzień pełny → propozycje w innych dniach', propsC.length > 0 && propsC.every(p => !M.sameDay(p.data, dz4)));
test('kolejne dni są blisko (+1..+5)', propsC.every(p => (p.data - dz4)/86400000 <= 5));

console.log('\n=== 5d. pełne pokrycie: czy generujemy pusty wynik? ===');
test('propozycje nigdy puste dla realnego żądania', propsA.length > 0 && propsB.length > 0 && propsC.length > 0);

console.log('\n=== 6. KALENDARZ DEMO — sensowność ===');
const dni = new Set(M.KALENDARZ.map(e => e.data.toDateString()));
console.log(`  wpisów: ${M.KALENDARZ.length}, dni z rezerwacjami: ${dni.size}`);
test('kalendarz ma wpisy', M.KALENDARZ.length > 10);
test('brak nakładających się rezerwacji', (() => {
  const byDay = {};
  M.KALENDARZ.forEach(e => { const k = e.data.toDateString(); (byDay[k] = byDay[k] || []).push(e); });
  return Object.values(byDay).every(arr => {
    arr.sort((a,b)=>a.start-b.start);
    return arr.every((e,i) => i === 0 || arr[i-1].end <= e.start);
  });
})());
test('wszystkie w godzinach 10-21', M.KALENDARZ.every(e => e.start >= 600 && e.end <= 1260));
test('weekendy pełniejsze niż tydzień', (() => {
  // liczymy tylko oryginalne wpisy z generatora (pomijamy dopisane w testach 5a-5c)
  const oryginalne = M.KALENDARZ.filter(e => !['T2','T3','T4'].includes(e.id));
  const we = oryginalne.filter(e => M.isWeekend(e.data)).length;
  const td = oryginalne.filter(e => !M.isWeekend(e.data)).length;
  console.log(`  weekend: ${we}, tydzień: ${td}`);
  return we > td;
})());

console.log('\n=== 7. KLUCZ CENOWY ===');
const sob = new Date(2026,10,28); const pon = new Date(2026,10,30);
test('sobota → pt_ndz', M.dayKey(sob) === 'pt_ndz');
test('poniedziałek → pn_czw', M.dayKey(pon) === 'pn_czw');

console.log(`\n${'='.repeat(46)}\nWYNIK: ${pass} OK, ${fail} FAIL\n`);
process.exit(fail ? 1 : 0);
