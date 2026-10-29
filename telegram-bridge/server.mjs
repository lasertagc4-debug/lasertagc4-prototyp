/**
 * Pośrednik Telegram dla strony Laser Tag C4.
 *
 * Dlaczego to istnieje:
 * strona jest statyczna (GitHub Pages), więc token bota NIE MOŻE trafić do przeglądarki.
 * Ten proces trzyma token u siebie i przyjmuje nagranie od klienta przez HTTP.
 *
 * Zabezpieczenia:
 *  - token wyłącznie w zmiennej środowiskowej, nigdy w kodzie ani w repo
 *  - limit rozmiaru nagrania (domyślnie 12 MB)
 *  - rate limit po adresie IP (domyślnie 10 nagrań / godzinę)
 *  - dozwolone originy (żeby nikt obcy nie podpiął się pod nasz endpoint)
 *  - nagrania trafiają do kolejki, jeśli Telegram chwilowo zawiedzie
 *
 * Uruchomienie:
 *   TELEGRAM_BOT_TOKEN=... TELEGRAM_CHAT_ID=... node server.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8788);
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const MAX_BYTES = Number(process.env.MAX_BYTES || 12 * 1024 * 1024);
const RATE_LIMIT = Number(process.env.RATE_LIMIT || 10);
const ALLOWED = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

const DATA = path.join(__dirname, 'data');
const QUEUE = path.join(DATA, 'kolejka');
const ZAPIS = path.join(DATA, 'nagrania');
for (const d of [DATA, QUEUE, ZAPIS]) fs.mkdirSync(d, { recursive: true });

if (!TOKEN) { console.error('BRAK TELEGRAM_BOT_TOKEN — nie startuje.'); process.exit(1); }
if (!CHAT_ID) { console.error('BRAK TELEGRAM_CHAT_ID — nie ma gdzie wysyłać.'); process.exit(1); }

/* ---------- rate limit ---------- */
const licznik = new Map();
function dozwolone(ip) {
  const teraz = Date.now();
  const okno = licznik.get(ip) || { start: teraz, n: 0 };
  if (teraz - okno.start > 3600_000) { okno.start = teraz; okno.n = 0; }
  okno.n++;
  licznik.set(ip, okno);
  return okno.n <= RATE_LIMIT;
}

/* ---------- czytanie ciała żądania ---------- */
function czytajCialo(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let rozmiar = 0;
    req.on('data', c => {
      rozmiar += c.length;
      if (rozmiar > limit) { reject(Object.assign(new Error('Za duże nagranie'), { code: 'ZA_DUZE' })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/* ---------- parsowanie multipart (bez zewnętrznych bibliotek) ---------- */
function parsujMultipart(buf, boundary) {
  const sep = Buffer.from('--' + boundary);
  const czesci = [];
  let idx = buf.indexOf(sep);
  while (idx !== -1) {
    const start = idx + sep.length;
    const end = buf.indexOf(sep, start);
    if (end === -1) break;
    let czesc = buf.subarray(start, end);
    if (czesc.subarray(0, 2).toString() === '\r\n') czesc = czesc.subarray(2);
    if (czesc.subarray(-2).toString() === '\r\n') czesc = czesc.subarray(0, -2);
    if (czesc.length > 0 && czesc.toString('utf8', 0, 2) !== '--') czesci.push(czesc);
    idx = end;
  }
  const pola = {}, pliki = {};
  for (const czesc of czesci) {
    const naglowekKoniec = czesc.indexOf('\r\n\r\n');
    if (naglowekKoniec === -1) continue;
    const naglowek = czesc.subarray(0, naglowekKoniec).toString('utf8');
    const dane = czesc.subarray(naglowekKoniec + 4);
    const nazwa = /name="([^"]+)"/.exec(naglowek)?.[1];
    if (!nazwa) continue;
    if (/filename="([^"]*)"/.test(naglowek)) {
      pliki[nazwa] = { dane, typ: /Content-Type:\s*([^\r\n]+)/i.exec(naglowek)?.[1] || 'audio/ogg' };
    } else {
      pola[nazwa] = dane.toString('utf8');
    }
  }
  return { pola, pliki };
}

/* ---------- konwersja na OGG/Opus (Telegram pokazuje wtedy głosówkę) ---------- */
async function naOgg(audio) {
  const tmp = path.join(DATA, `tmp_${crypto.randomBytes(4).toString('hex')}`);
  const wej = tmp + '.webm';
  const wyj = tmp + '.ogg';
  fs.writeFileSync(wej, audio);

  const probuj = (args) => new Promise(resolve => {
    const p = spawn(FFMPEG, args, { windowsHide: true });
    let err = '';
    p.stdout.on('data', d => { err += d.toString(); });
    p.stderr.on('data', d => { err += d.toString(); });
    p.on('error', e => resolve({ ok: false, err: 'nie uruchomiono ffmpeg: ' + e.message }));
    p.on('close', code => resolve({ ok: code === 0 && fs.existsSync(wyj), err: err.slice(-400) }));
  });

  const wynik = await probuj([
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'webm',
    '-i', wej,
    '-vn', '-ac', '1', '-ar', '48000',
    '-c:a', 'libopus', '-b:a', '32k', '-application', 'voip',
    wyj
  ]);

  if (!wynik.ok) {
    // awaryjnie: bierzemy kod źródłowy bez rekompresji (lepiej załącznik niż nic)
    console.error('[KONWERSJA NIEUDANA]', wynik.err);
    try { fs.unlinkSync(wej); } catch (e) {}
    try { fs.unlinkSync(wyj); } catch (e) {}
    return { dane: audio, mime: 'audio/ogg', przekonwertowano: false, blad: wynik.err };
  }

  const ogg = fs.readFileSync(wyj);
  try { fs.unlinkSync(wej); fs.unlinkSync(wyj); } catch (e) {}
  return { dane: ogg, mime: 'audio/ogg', przekonwertowano: true };
}

/* ---------- wysyłka do Telegrama ---------- */
async function wyslijDoTelegrama(audio, mime, opis) {
  const fd = new FormData();
  fd.append('chat_id', String(CHAT_ID));
  fd.append('voice', new Blob([audio], { type: mime }), 'nagranie.ogg');
  fd.append('caption', opis.slice(0, 1024));
  fd.append('parse_mode', 'HTML');
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendVoice`, { method: 'POST', body: fd });
  const j = await r.json();
  if (!j.ok) throw new Error('Telegram: ' + JSON.stringify(j));
  return j.result;
}

/* ---------- serwer ---------- */
const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || '';
  const corsOk = !ALLOWED.length || ALLOWED.includes(origin);
  res.setHeader('Access-Control-Allow-Origin', corsOk && origin ? origin : (ALLOWED[0] || '*'));
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  if (req.url === '/zdrowie') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, tryb: 'zywy' }));
  }

  if (req.url !== '/nagranie' || req.method !== 'POST') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, blad: 'Nie ma takiej ścieżki' }));
  }

  if (!corsOk) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, blad: 'Niedozwolone źródło żądania' }));
  }

  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
  if (!dozwolone(ip)) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, blad: 'Za dużo nagrań z tego adresu. Zadzwoń: 888 028 092' }));
  }

  let buf;
  try {
    buf = await czytajCialo(req, MAX_BYTES);
  } catch (e) {
    res.writeHead(413, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, blad: 'Nagranie jest za duże (limit 12 MB).' }));
  }

  const ct = req.headers['content-type'] || '';
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/.exec(ct);
  if (!boundary) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, blad: 'Brak pliku nagrania' }));
  }

  const { pola, pliki } = parsujMultipart(buf, boundary[1] || boundary[2]);
  const audio = pliki.audio || pliki.nagranie;
  if (!audio || !audio.dane.length) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, blad: 'Nie dotarło żadne nagranie' }));
  }

  const id = crypto.randomBytes(4).toString('hex').toUpperCase();
  const telefon = (pola.telefon || '').replace(/[^\d+]/g, '').slice(0, 16);
  const imie = (pola.imie || '').slice(0, 80);
  const termin = (pola.termin || '').slice(0, 120);

  const opis = [
    '<b>Nowa wiadomość głosowa ze strony</b>',
    `Numer zgłoszenia: <b>LT-${id}</b>`,
    imie ? `Klient: ${imie}` : null,
    telefon ? `Telefon: <code>${telefon}</code>` : null,
    termin ? `Termin z formularza: ${termin}` : null,
    `Czas: ${new Date().toLocaleString('pl-PL')}`
  ].filter(Boolean).join('\n');

  // Chrome nagrywa WebM bez znacznika długości — Telegram pokaże to jako załącznik.
  // Konwertujemy na OGG/Opus, żeby w czacie pojawiła się normalna głosówka.
  const skonwertowane = await naOgg(audio.dane);
  const nazwa = `LT-${id}.ogg`;
  const extra = JSON.stringify({ id, telefon, imie, termin, ip, czas: new Date().toISOString(), przekonwertowano: skonwertowane.przekonwertowano }, null, 2);
  fs.writeFileSync(path.join(ZAPIS, `LT-${id}.json`), extra);

  try {
    await wyslijDoTelegrama(skonwertowane.dane, skonwertowane.mime, opis);
    fs.writeFileSync(path.join(ZAPIS, nazwa), skonwertowane.dane);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, id: `LT-${id}`, glosowka: skonwertowane.przekonwertowano }));
  } catch (e) {
    fs.writeFileSync(path.join(QUEUE, nazwa), skonwertowane.dane);
    fs.writeFileSync(path.join(QUEUE, `LT-${id}.json`), extra);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, id: `LT-${id}`, blad: 'Zapisane, ale wysyłka się nie udała — ekipa odbierze ręcznie. Zadzwoń: 888 028 092' }));
  }
});

server.listen(PORT, () => {
  console.log(`Pośrednik Telegram: http://127.0.0.1:${PORT}`);
  console.log(`Cel: chat ${CHAT_ID.slice(0, 4)}… | limit ${MAX_BYTES/1048576} MB | ${RATE_LIMIT} nagrań/h/IP`);
  console.log(`Dozwolone originy: ${ALLOWED.length ? ALLOWED.join(', ') : '(wszystkie — ustaw ALLOWED_ORIGINS przed publikacją!)'}`);
});
