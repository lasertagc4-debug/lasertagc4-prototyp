/* ============================================================
   LASER TAG C4 — logika strony
   1. CENNIK jako jedno źródło prawdy (sekcja 11.1.6 audytu)
   2. Silnik weryfikacji terminu (sekcja 11.1.1 audytu)
   3. Kalkulator i podsumowanie
   4. Formularz + potwierdzenie
   ============================================================ */
'use strict';

/* ---------- 1. CENNIK — jedno źródło prawdy ---------- */
const CENNIK = {
  urodziny: [
    { id:'u1', nazwa:'Podstawowy', rundy:2, godziny:2.5, cena:{ pn_czw:550, pt_ndz:650 },
      zawiera:['2 rundy laser taga','Sala urodzinowa przez 2,5 h','Biała zastawa na 25 osób','Kawa i herbata gratis'] },
    { id:'u2', nazwa:'Rozszerzony', rundy:3, godziny:3, cena:{ pn_czw:650, pt_ndz:750 }, polecany:true,
      zawiera:['3 rundy laser taga','Sala urodzinowa przez 3 h','Biała zastawa na 25 osób','Kawa i herbata gratis'] },
    { id:'u3', nazwa:'Premium', rundy:4, godziny:4, cena:{ pn_czw:750, pt_ndz:850 },
      zawiera:['4 rundy laser taga','Sala urodzinowa przez 4 h','Biała zastawa na 25 osób','Kawa i herbata gratis'] }
  ],
  szkolne: [
    { id:'s1', nazwa:'Pojedyncza gra', cena:30, opis:'Jedna rozgrywka na osobę' },
    { id:'s2', nazwa:'Mini turniej', cena:60, opis:'Każdy uczestnik gra dwa razy' },
    { id:'s3', nazwa:'Maxi turniej', cena:85, opis:'Dwie gry + cola + pizza 40 cm na 4 osoby', polecany:true }
  ],
  indywidualni: { pn_czw:32, pt_ndz:38, min_osob:4, max_osob:10 },
  limity: {
    max_grajacych_urodziny:20,
    max_niegracjacych:10,
    doplata_osoba:20,
    doplata_zastawa:20,
    przedluzenie_150:150,
    przedluzenie_200:200,
    start_urodzin_najpozniej:'17:00',
    rezerwacja_min_dni:1
  },
  // bufory: przygotowanie sali + reset + bezpieczeństwo (sekcja 11.1.1)
  bufory: { przed:15, po:15, bezpieczenstwo:15 }
};

const DNI = ['niedziela','poniedziałek','wtorek','środa','czwartek','piątek','sobota'];
const MIES = ['sty','lut','mar','kwi','maj','cze','lip','sie','wrz','paź','lis','gru'];

const formatPLN = n => new Intl.NumberFormat('pl-PL').format(Math.round(n)) + ' zł';
const toMin = hhmm => { const [h,m] = hhmm.split(':').map(Number); return h*60+m; };
const toHHMM = min => String(Math.floor(min/60)).padStart(2,'0') + ':' + String(min%60).padStart(2,'0');
const isWeekend = d => d.getDay() === 0 || d.getDay() === 6;
const dayKey = d => isWeekend(d) ? 'pt_ndz' : 'pn_czw';
const sameDay = (a,b) => a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();

/* ---------- 2. KALENDARZ — dane demonstracyjne ----------
   W produkcji: GET Google Calendar API v3 (events.list) na czas serwisowy.
   Format identyczny, więc podmiana to jedna funkcja.               */
function losowyKalendarz(dniNaprzod = 30){
  // deterministyczny „szum" zajętości — realistyczny rozkład: weekendy pełniejsze
  const out = [];
  const bazowa = new Date();
  bazowa.setHours(0,0,0,0);
  let seed = 20261024;
  const rnd = () => { seed = (seed*1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

  for(let i = 0; i <= dniNaprzod; i++){
    const d = new Date(bazowa); d.setDate(bazowa.getDate() + i);
    const w = isWeekend(d);
    // ile imprez tego dnia: weekend 2-3, tydzień 0-2
    const ile = w ? (rnd() > .35 ? 2 : 1) + (rnd() > .7 ? 1 : 0)
                  : (rnd() > .55 ? 1 : 0) + (rnd() > .85 ? 1 : 0);
    let cursor = 10*60;
    for(let k = 0; k < ile; k++){
      const rodzaje = ['urodziny','urodziny','szkolne','indywidualni'];
      const typ = rodzaje[Math.floor(rnd()*rodzaje.length)];
      let dlugosc;
      if(typ === 'urodziny')      dlugosc = CENNIK.urodziny[Math.floor(rnd()*3)].godziny*60;
      else if(typ === 'szkolne')  dlugosc = (rnd() > .5 ? 120 : 90);
      else                        dlugosc = 60;
      const start = cursor + (rnd() > .5 ? 30 : 0);
      cursor = start + dlugosc + CENNIK.bufory.przed + CENNIK.bufory.po + 15;
      if(cursor > 21*60) break;
      out.push({ data:new Date(d), start, end: start + dlugosc, typ, id:'REZ'+(1000+i*10+k) });
    }
  }
  return out;
}
const KALENDARZ = losowyKalendarz(30);

/* ---------- 2b. SILNIK WERYFIKACJI (sekcja 11.1.1) ---------- */
const GODZINA_OTWARCIA = 10*60;
const GODZINA_ZAMKNIECIA = 21*60;

/** Zwraca pełne zajęcie sali dla danej imprezy: pakiet + przygotowanie + reset + bufor. */
function oknoZajecia(typ, pakietId){
  let bazowy;
  if(typ === 'urodziny'){
    const p = CENNIK.urodziny.find(x => x.id === pakietId) || CENNIK.urodziny[1];
    bazowy = p.godziny * 60;
  } else if(typ === 'szkolne'){
    bazowy = 90;
  } else {
    bazowy = 60;
  }
  const { przed, po, bezpieczenstwo } = CENNIK.bufory;
  return { bazowy, przed, po, bezpieczenstwo, total: bazowy + przed + po + bezpieczenstwo };
}

/** Blokady w danym dniu (start-1h .. end+1h), żeby dobrze liczyć sąsiedztwo. */
function zajeteWDanymDniu(dzien){
  return KALENDARZ.filter(e => sameDay(e.data, dzien)).sort((a,b) => a.start - b.start);
}

/** Czy [start, start+dur] mieści się między sąsiednimi rezerwacjami? */
function czyWolne(dzien, start, dur){
  const end = start + dur;
  if(start < GODZINA_OTWARCIA) return false;
  if(end > GODZINA_ZAMKNIECIA) return false;
  const zajete = zajeteWDanymDniu(dzien);
  for(const e of zajete){
    // nakładanie się z buforami: rezerwacja zajmuje [start-przed, end+po+bezp]
    const busyFrom = e.start - CENNIK.bufory.przed;
    const busyTo   = e.end + CENNIK.bufory.po + CENNIK.bufory.bezpieczenstwo;
    if(start < busyTo && end + CENNIK.bufory.po + CENNIK.bufory.bezpieczenstwo > busyFrom) return false;
  }
  return true;
}

/** Lista wolnych godzin startu w danym dniu, co 15 min. */
function wolneGodziny(dzien, typ, pakietId){
  const { total } = oknoZajecia(typ, pakietId);
  const out = [];
  for(let t = GODZINA_OTWARCIA; t <= GODZINA_ZAMKNIECIA - total; t += 15){
    if(czyWolne(dzien, t, total)) out.push(t);
  }
  return out;
}

/** Generator propozycji wg priorytetu z audytu:
 *  a) ta sama data wcześniej, b) ta sama data później, c) najbliższe dni. */
function propozycje(dzien, start, typ, pakietId, max = 5){
  const { total } = oknoZajecia(typ, pakietId);
  const wynik = [];
  const jestDostepny = (d, s) => s >= GODZINA_OTWARCIA && s + total <= GODZINA_ZAMKNIECIA && czyWolne(d, s, total);

  // a) tego samego dnia, wcześniej — najbliżej żądanej godziny
  for(let delta = 15; delta <= 12*60 && wynik.length < max; delta += 15){
    const s = start - delta;
    if(jestDostepny(dzien, s)) wynik.push({ data:new Date(dzien), start:s, kind:'wczesniej' });
  }
  // b) tego samego dnia, później
  for(let delta = 15; delta <= 12*60 && wynik.length < max; delta += 15){
    const s = start + delta;
    if(jestDostepny(dzien, s)) wynik.push({ data:new Date(dzien), start:s, kind:'pozniej' });
  }
  // c) najbliższe dni, ta sama godzina ± 3 h
  for(let d = 1; d <= 21 && wynik.length < max; d++){
    const nd = new Date(dzien); nd.setDate(dzien.getDate() + d);
    const kandydaci = [];
    for(let off = 0; off <= 180; off += 15){
      kandydaci.push(start + off, start - off);
    }
    kandydaci.sort((a,b) => Math.abs(a-start) - Math.abs(b-start));
    for(const s of kandydaci){
      if(jestDostepny(nd, s)){ wynik.push({ data:nd, start:s, kind:'inny_dzien' }); break; }
    }
  }
  return wynik;
}

/* ---------- 3. STAN I UI ---------- */
const stan = {
  typ: 'urodziny',
  pakiet: 'u2',
  dzien: null,
  start: null,
  osoby: 12,
  imie: '', telefon: '', email: '', uwagi: ''
};

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

/* pasek postępu rezerwacji — pokazuje, ile kroków zostało */
function odswiezPostep(){
  const el = $('#progress');
  if(!el) return;
  let zrobione = 1;                                    // typ imprezy jest zawsze wybrany
  if(stan.dzien) zrobione++;
  if(stan.start !== null) zrobione++;
  if(stan.start !== null) zrobione++;                   // cena liczy się sama z godziną
  const proc = Math.round((zrobione / 4) * 100);
  el.querySelector('.progress-fill').style.width = proc + '%';
  el.querySelector('.progress-text').textContent = zrobione >= 4
    ? 'Wszystko gotowe — uzupełnij dane i wyślij'
    : `Krok ${zrobione} z 4 · ${stan.dzien ? (stan.start !== null ? 'wybierz dane kontaktowe' : 'wybierz godzinę') : 'wybierz dzień'}`;
}

/* ---------- przełącznik dni cen ---------- */
function inicjujPrzelacznikDni(){
  $$('[data-dayswitch]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tryb = btn.dataset.dayswitch;
      $$('[data-dayswitch]').forEach(b => b.classList.toggle('active', b === btn));
      $$('[data-price]').forEach(el => {
        el.textContent = formatPLN(Number(el.dataset[tryb === 'pn_czw' ? 'pnCzw' : 'ptNdz']));
      });
      $$('[data-per]').forEach(el => {
        const total = Number(el.dataset[tryb === 'pn_czw' ? 'pnCzw' : 'ptNdz']);
        const osoby = Number(el.dataset.osoby) || 20;
        el.textContent = total ? `${(total/osoby).toFixed(2).replace('.',',')} zł za osobę (przy ${osoby} os.)` : '';
      });
    });
  });
}

/* ---------- pasek dni ---------- */
function renderDni(){
  const strip = $('#daystrip');
  if(!strip) return;
  const dzisiaj = new Date(); dzisiaj.setHours(0,0,0,0);
  let html = '';
  for(let i = 1; i <= 21; i++){           // min. 1 dzień wyprzedzenia (sekcja 11.1.1, pkt 5)
    const d = new Date(dzisiaj); d.setDate(dzisiaj.getDate() + i);
    const { total } = oknoZajecia(stan.typ, stan.pakiet);
    const wolne = wolneGodziny(d, stan.typ, stan.pakiet);
    const brak = wolne.length === 0;
    const sel = stan.dzien && sameDay(stan.dzien, d) ? ' selected' : '';
    html += `<button class="daybtn${sel}" data-dzien="${d.toISOString()}" ${brak ? 'disabled' : ''}>
      <span class="dw">${DNI[d.getDay()].slice(0,3)}</span>
      <span class="dd">${d.getDate()}</span>
      <span class="mm">${MIES[d.getMonth()]}</span>
    </button>`;
  }
  strip.innerHTML = html;
  strip.querySelectorAll('.daybtn').forEach(b => {
    b.addEventListener('click', () => {
      stan.dzien = new Date(b.dataset.dzien);
      stan.start = null;
      strip.querySelectorAll('.daybtn').forEach(x => x.classList.toggle('selected', x === b));
      renderGodziny();
      renderPodsumowanie();
      odswiezPostep();
    });
  });
}

/* ---------- godziny ---------- */
function renderGodziny(){
  const box = $('#slotgrid');
  const boxWrap = $('#slotwrap');
  if(!box) return;
  if(!stan.dzien){ boxWrap.style.display = 'none'; const hint = $('#slot-hint'); if(hint) hint.style.display='block'; return; }
  boxWrap.style.display = 'block';
  const hintEl = $('#slot-hint'); if(hintEl) hintEl.style.display='none';

  const { total, bazowy } = oknoZajecia(stan.typ, stan.pakiet);
  const wolne = wolneGodziny(stan.dzien, stan.typ, stan.pakiet);
  let html = '';
  for(let t = GODZINA_OTWARCIA; t <= GODZINA_ZAMKNIECIA - 60; t += 30){
    const ok = wolne.includes(t);
    const sel = stan.start === t ? ' selected' : '';
    html += `<button class="slot ${ok ? '' : 'taken'}${sel}" data-start="${t}" ${ok ? '' : 'disabled'}
      title="${ok ? 'Wolny' : 'Zajęty lub nie zmieści się'}">
      ${toHHMM(t)}<span class="dur">${ok ? (bazowy/60).toFixed(1).replace('.',',') + ' h' : 'zajęte'}</span>
    </button>`;
  }
  box.innerHTML = html;

  const verdict = $('#verdict');
  const wolneDlugo = wolne.length;

  if(wolneDlugo === 0){
    // żądana godzina: wybrana, a jeśli nie było wyboru — start o 15:00
    const zadana = (stan.start !== null) ? stan.start : 15*60;
    const props = propozycje(stan.dzien, zadana, stan.typ, stan.pakiet, 5);
    verdict.className = 'verdict bad show';
    verdict.innerHTML = `
      <div class="verdict-head">Brak wolnego okna w tym dniu</div>
      <p style="margin:0">Ta impreza potrzebuje <strong>${(total/60).toFixed(2).replace('.',',')} h</strong> ciągłego zajęcia sali
      (${(bazowy/60).toFixed(1).replace('.',',')} h gry + przygotowanie + sprzątanie + bufor). W tym dniu nie ma takiego okna.</p>
      ${props.length ? `<ul class="proposals">${props.map((p,i) => `
        <li>
          <div>
            <div class="p-when">${DNI[p.data.getDay()]} ${p.data.getDate()} ${MIES[p.data.getMonth()]} · ${toHHMM(p.start)}</div>
            <div class="p-meta">${p.kind === 'inny_dzien' ? 'najbliższy dzień' : (p.kind === 'wczesniej' ? 'tego dnia, wcześniej' : 'tego dnia, później')}</div>
          </div>
          <button data-prop="${i}">Wybierz</button>
        </li>`).join('')}</ul>` : ''}`;

    verdict.querySelectorAll('[data-prop]').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = props[Number(btn.dataset.prop)];
        stan.dzien = new Date(p.data); stan.start = p.start;
        renderDni(); renderGodziny(); renderPodsumowanie(); odswiezPostep();
      });
    });
  } else {
    verdict.className = 'verdict ok show';
    verdict.innerHTML = `<div class="verdict-head">Termin dostępny</div>
      <p style="margin:0">W tym dniu jest <strong>${wolneDlugo}</strong> wolnych godzin startu. Wybierz jedną z powyższych.</p>`;
  }

  box.querySelectorAll('.slot:not(.taken)').forEach(btn => {
    btn.addEventListener('click', () => {
      stan.start = Number(btn.dataset.start);
      box.querySelectorAll('.slot').forEach(x => x.classList.toggle('selected', x === btn));
      renderPodsumowanie();
      odswiezPostep();
    });
  });
}

/* ---------- 4. KALKULATOR + PODSUMOWANIE ---------- */
function cenaPakietu(typ, pakietId, dzien){
  const klucz = dayKey(dzien || new Date());
  if(typ === 'urodziny'){
    const p = CENNIK.urodziny.find(x => x.id === pakietId) || CENNIK.urodziny[1];
    return { bazowa: p.cena[klucz], nazwa: `Pakiet ${p.nazwa}` };
  }
  if(typ === 'szkolne'){
    const p = CENNIK.szkolne.find(x => x.id === pakietId) || CENNIK.szkolne[0];
    return { bazowa: p.cena * stan.osoby, nazwa: p.nazwa, zaOsobe: p.cena };
  }
  const c = CENNIK.indywidualni[klucz];
  return { bazowa: c * stan.osoby, nazwa: 'Gra indywidualna', zaOsobe: c };
}

function renderPodsumowanie(){
  const box = $('#summary');
  if(!box) return;
  const typ = stan.typ;
  const osoby = stan.osoby;
  const limity = CENNIK.limity;
  const c = cenaPakietu(typ, stan.pakiet, stan.dzien ? stan.dzien : new Date());
  const rows = [];
  let total = 0;

  if(!stan.dzien || stan.start === null){
    box.innerHTML = `<div class="summary-note">Cena pojawi się tutaj po wybraniu dnia i godziny — razem z rozbiciem na pakiet i dopłaty.</div>`;
    return;
  }

  const okno = oknoZajecia(typ, stan.pakiet);
  const koniec = stan.start + okno.bazowy;

  rows.push(['Termin', `${DNI[stan.dzien.getDay()]} ${stan.dzien.getDate()} ${MIES[stan.dzien.getMonth()]}, ${toHHMM(stan.start)}–${toHHMM(koniec)}`]);
  rows.push([c.nazwa + (c.zaOsobe ? ` · ${osoby} os.` : ''), formatPLN(c.bazowa)]);
  total += c.bazowa;

  // dopłata za osoby powyżej limitu (urodziny)
  if(typ === 'urodziny' && osoby > limity.max_grajacych_urodziny){
    const nad = osoby - limity.max_grajacych_urodziny;
    const kwota = nad * limity.doplata_osoba;
    rows.push([`Dopłata za ${nad} os. powyżej limitu ${limity.max_grajacych_urodziny}`, formatPLN(kwota)]);
    total += kwota;
  }
  // minimum osób (indywidualni)
  if(typ === 'indywidualni' && osoby < CENNIK.indywidualni.min_osob){
    rows.push(['⚠ Minimum gry indywidualnej', CENNIK.indywidualni.min_osob + ' osoby']);
  }
  if(typ === 'indywidualni' && osoby > CENNIK.indywidualni.max_osob){
    rows.push(['⚠ Maksimum gry indywidualnej', CENNIK.indywidualni.max_osob + ' osób']);
  }

  if(c.zaOsobe && osoby > 0){
    rows.push(['Cena za osobę', (total/osoby).toFixed(2).replace('.',',') + ' zł']);
  }
  rows.push(['Zajęcie sali łącznie', `${(okno.total/60).toFixed(2).replace('.',',')} h (gra + przygotowanie + sprzątanie)`]);

  box.innerHTML = rows.map(r => `<div class="summary-row"><span>${r[0]}</span><span>${r[1]}</span></div>`).join('')
    + `<div class="summary-row summary-total"><span>Razem</span><span>${formatPLN(total)}</span></div>
       <div class="summary-note">Cena orientacyjna według cennika. Ostateczną kwotę potwierdza ekipa w SMS-ie.
       ${typ === 'urodziny' ? 'Urodziny po godzinie 17:00 wyceniamy indywidualnie — po prostu zostaw zgłoszenie, oddzwonimy.' : ''}</div>`;
}

/* ---------- 5. FORMULARZ + POTWIERDZENIE ---------- */
function inicjujFormularz(){
  const form = $('#booking-form');
  if(!form) return;

  // typ imprezy
  $$('[data-typ]').forEach(btn => {
    btn.addEventListener('click', () => {
      stan.typ = btn.dataset.typ;
      stan.pakiet = stan.typ === 'urodziny' ? 'u2' : (stan.typ === 'szkolne' ? 's3' : 'ind');
      stan.start = null;
      $$('[data-typ]').forEach(b => b.classList.toggle('active', b === btn));
      renderDni(); renderGodziny(); renderPodsumowanie(); odswiezPostep();
    });
  });

  // pakiety urodzin
  const selPak = $('#pakiet');
  if(selPak){
    selPak.addEventListener('change', () => {
      stan.pakiet = selPak.value;
      stan.start = null;
      renderDni(); renderGodziny(); renderPodsumowanie();
    });
  }

  // liczba osób
  const inpOs = $('#osoby');
  if(inpOs){
    inpOs.addEventListener('change', () => {
      stan.osoby = Math.max(1, Number(inpOs.value) || 1);
      renderPodsumowanie();
    });
  }

  form.addEventListener('submit', e => {
    e.preventDefault();

    // walidacja krokowa — pokazujemy błąd przy konkretnym polu, nie w alercie
    const pokazBlad = (tytul, tresc, sel) => {
      let box = $('#form-error');
      if(!box){
        box = document.createElement('div');
        box.id = 'form-error';
        box.className = 'verdict bad show';
        box.style.marginTop = '16px';
        form.appendChild(box);
      }
      box.innerHTML = `<div class="verdict-head">${tytul}</div><p style="margin:0">${tresc}</p>`;
      if(sel){
        const el = $(sel);
        if(el){ el.scrollIntoView({ behavior:'smooth', block:'center' }); el.focus({ preventScroll:true }); }
      }
    };

    if(stan.start === null){
      pokazBlad(
        'Brakuje wybranej godziny',
        'Wybierz dzień w kroku 2, potem wolną godzinę w kroku 3 — dopiero wtedy policzę cenę i przyjmę zgłoszenie.',
        '#daystrip'
      );
      return;
    }
    const imie = $('#imie').value.trim();
    const tel = $('#telefon').value.replace(/[\s-]/g, '');
    if(imie.length < 2){
      pokazBlad('Podaj imię i nazwisko', 'Potrzebujemy ich do potwierdzenia rezerwacji i ewentualnego kontaktu w sprawie imprezy.', '#imie');
      return;
    }
    if(tel.length < 9){
      pokazBlad('Numer telefonu jest za krótki', 'Numer służy nam tylko do wysłania SMS-a z potwierdzeniem terminu. Wpisz go w formacie 600 100 200.', '#telefon');
      return;
    }

    const kod = 'LT-' + String(Math.floor(1000 + Math.random()*9000));
    const c = cenaPakietu(stan.typ, stan.pakiet, stan.dzien);
    $('#confirm-code').textContent = kod;
    $('#confirm-summary').textContent =
      `${DNI[stan.dzien.getDay()]} ${stan.dzien.getDate()} ${MIES[stan.dzien.getMonth()]}, ${toHHMM(stan.start)} · ${stan.osoby} os. · ${formatPLN(c.bazowa)}`;

    // chowamy błędy z poprzednich prób i pokazujemy potwierdzenie
    const staryBlad = $('#form-error'); if(staryBlad) staryBlad.remove();
    const box = $('#confirm-box');
    box.classList.add('show');
    box.scrollIntoView({ behavior:'smooth', block:'center' });

    // w produkcji: blokada terminu (status OCZEKUJE, TTL 2h) + powiadomienie ekipy
    console.log('[BLOKADA TYMCZASOWA]', { kod, termin: stan.dzien, start: stan.start, typ: stan.typ, pakiet: stan.pakiet, osoby: stan.osoby });
  });
}

/* ---------- 6. MENU / GALERIA / ROK ---------- */
function inicjujReszte(){
  const toggle = $('.menu-toggle');
  const nav = $('.nav');
  if(toggle && nav){
    toggle.addEventListener('click', () => {
      nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', nav.classList.contains('open'));
    });
    nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => nav.classList.remove('open')));
  }

  const lb = $('#lightbox');
  const lbImg = $('#lightbox-img');
  $$('.gallery figure').forEach(f => {
    f.addEventListener('click', () => {
      const img = f.querySelector('img');
      if(!img || !lb) return;
      lbImg.src = img.src;
      lbImg.alt = img.alt;
      lb.classList.add('show');
    });
  });
  if(lb){
    lb.addEventListener('click', () => lb.classList.remove('show'));
    document.addEventListener('keydown', e => { if(e.key === 'Escape') lb.classList.remove('show'); });
  }

  const rok = $('#rok');
  if(rok) rok.textContent = new Date().getFullYear();
}

/* ---------- start ---------- */
document.addEventListener('DOMContentLoaded', () => {
  inicjujPrzelacznikDni();
  inicjujFormularz();
  inicjujReszte();
  renderDni();
  renderGodziny();
  renderPodsumowanie();
  odswiezPostep();
});
