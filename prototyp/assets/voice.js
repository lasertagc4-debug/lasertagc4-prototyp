/* ============================================================
   WIADOMOŚĆ GŁOSOWA — nagrywanie i wysyłka
   ============================================================
   Wysyłka idzie przez pośrednika (telegram-bridge), nigdy prosto do
   Telegrama — token bota nie może być w plikach strony.
   Endpoint ustawia się w jednym miejscu poniżej.
   ============================================================ */

// endpoint czytany przy każdej wysyłce — pozwala też podmienić go bez przeładowania strony
const VOICE_ENDPOINT_DOMYSLNY = '';
const endpoint = () => window.LT_VOICE_ENDPOINT || VOICE_ENDPOINT_DOMYSLNY;
const VOICE_LIMIT_S = 60;                                 // maksymalna długość nagrania
const VOICE_MAX_B = 12 * 1024 * 1024;                     // musi zgadzać się z serwerem

let nagrywarka = null, strumien = null, kawalki = [], blobNagrania = null;
let czasStart = 0, timerId = null, analizator = null, audioCtx = null, animId = null, autoStop = null;

/* ---------- wybór formatu, który obsłuży przeglądarka ---------- */
function wybierzFormat() {
  const kandydaci = [
    { typ: 'audio/ogg;codecs=opus', ext: 'ogg' },   // Telegram odtwarza jako głosówkę
    { typ: 'audio/webm;codecs=opus', ext: 'ogg' },  // Chrome/Edge/Firefox → serwer konwertuje
    { typ: 'audio/mp4', ext: 'ogg' }                // Safari
  ];
  if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return null;
  return kandydaci.find(k => MediaRecorder.isTypeSupported(k.typ)) || null;
}

/* ---------- UI ---------- */
const V = {
  modal: () => document.getElementById('voice-modal'),
  pokaz(stanId) {
    ['voice-idle', 'voice-recording', 'voice-review', 'voice-done', 'voice-error']
      .forEach(id => { const el = document.getElementById(id); if (el) el.hidden = (id !== stanId); });
  },
  blad(tytul, opis) {
    document.getElementById('voice-error-title').textContent = tytul || 'Nie udało się wysłać';
    document.getElementById('voice-error-msg').textContent = opis || '';
    this.pokaz('voice-error');
  }
};

function otworzModal() {
  V.modal().hidden = false;
  document.body.style.overflow = 'hidden';
  V.pokaz('voice-idle');
  const wsparcie = document.getElementById('voice-support');
  const fmt = wybierzFormat();

  if (!fmt) {
    wsparcie.textContent = 'Ta przeglądarka nie umie nagrywać dźwięku. Zadzwoń: 888 028 092 — załatwimy od razu.';
    wsparcie.classList.add('bad');
    document.getElementById('voice-start').disabled = true;
    document.getElementById('voice-start').style.opacity = '.45';
  } else if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    wsparcie.textContent = 'Mikrofon działa tylko przez bezpieczne połączenie (https). Zadzwoń: 888 028 092.';
    wsparcie.classList.add('bad');
  } else {
    wsparcie.textContent = 'Mikrofon uruchomi się po kliknięciu. Nic nie nagrywamy bez Twojej zgody.';
    wsparcie.classList.remove('bad');
    document.getElementById('voice-start').disabled = false;
    document.getElementById('voice-start').style.opacity = '';
  }
  setTimeout(() => document.getElementById('voice-start').focus(), 60);
}

function zamknijModal() {
  zatrzymajWszystko();
  V.modal().hidden = true;
  document.body.style.overflow = '';
  document.getElementById('voice-open').focus();
}

function zatrzymajWszystko() {
  if (timerId) { clearInterval(timerId); timerId = null; }
  if (autoStop) { clearTimeout(autoStop); autoStop = null; }
  if (animId) { cancelAnimationFrame(animId); animId = null; }
  if (nagrywarka && nagrywarka.state !== 'inactive') { try { nagrywarka.stop(); } catch (e) {} }
  nagrywarka = null;
  if (strumien) { strumien.getTracks().forEach(t => t.stop()); strumien = null; }
  if (audioCtx) { try { audioCtx.close(); } catch (e) {} audioCtx = null; }
  analizator = null;
  const wave = document.getElementById('voice-wave');
  if (wave) wave.innerHTML = '';
}

/* ---------- wizualizacja poziomu głosu ---------- */
function rysujFale(strum) {
  const wave = document.getElementById('voice-wave');
  wave.innerHTML = '';
  const slupki = [];
  for (let i = 0; i < 32; i++) { const s = document.createElement('i'); wave.appendChild(s); slupki.push(s); }
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const src = audioCtx.createMediaStreamSource(strum);
    analizator = audioCtx.createAnalyser();
    analizator.fftSize = 64;
    src.connect(analizator);
    const dane = new Uint8Array(analizator.frequencyBinCount);
    const rysuj = () => {
      if (!analizator) return;
      analizator.getByteFrequencyData(dane);
      for (let i = 0; i < slupki.length; i++) {
        const v = dane[i % dane.length] / 255;
        slupki[i].style.height = Math.max(6, Math.round(v * 56)) + 'px';
      }
      animId = requestAnimationFrame(rysuj);
    };
    rysuj();
  } catch (e) { /* bez wizualizacji też działa */ }
}

/* ---------- start nagrywania ---------- */
async function startNagrywania() {
  const fmt = wybierzFormat();
  if (!fmt) return;

  try {
    strumien = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
  } catch (e) {
    const powod = {
      NotAllowedError: 'Odmówiłeś dostępu do mikrofonu. Możesz to zmienić w ustawieniach przeglądarki albo po prostu zadzwonić: 888 028 092.',
      NotFoundError: 'Nie znaleźliśmy mikrofonu w tym urządzeniu. Zadzwoń: 888 028 092.',
      NotReadableError: 'Mikrofon jest zajęty przez inną aplikację. Zamknij ją i spróbuj ponownie.'
    }[e.name] || 'Nie udało się włączyć mikrofonu. Zadzwoń: 888 028 092.';
    V.blad('Mikrofon niedostępny', powod);
    return;
  }

  kawalki = [];
  nagrywarka = new MediaRecorder(strumien, { mimeType: fmt.typ });
  nagrywarka.ondataavailable = e => { if (e.data && e.data.size) kawalki.push(e.data); };
  nagrywarka.onstop = zakonczNagrywanie;
  nagrywarka.start(250);

  V.pokaz('voice-recording');
  rysujFale(strumien);

  czasStart = Date.now();
  document.getElementById('voice-timer').textContent = '0:00';
  timerId = setInterval(() => {
    const s = Math.floor((Date.now() - czasStart) / 1000);
    document.getElementById('voice-timer').textContent =
      Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }, 200);

  autoStop = setTimeout(() => { if (nagrywarka && nagrywarka.state === 'recording') zatrzymajNagrywanie(); }, VOICE_LIMIT_S * 1000);
}

function zatrzymajNagrywanie() {
  if (timerId) { clearInterval(timerId); timerId = null; }
  if (autoStop) { clearTimeout(autoStop); autoStop = null; }
  if (animId) { cancelAnimationFrame(animId); animId = null; }
  if (nagrywarka && nagrywarka.state !== 'inactive') nagrywarka.stop();
  if (strumien) { strumien.getTracks().forEach(t => t.stop()); strumien = null; }
  if (audioCtx) { try { audioCtx.close(); } catch (e) {} audioCtx = null; }
  analizator = null;
}

/* ---------- po zatrzymaniu: odsłuch ---------- */
function zakonczNagrywanie() {
  const typ = (nagrywarka && nagrywarka.mimeType) || 'audio/ogg';
  blobNagrania = new Blob(kawalki, { type: typ });
  nagrywarka = null;

  const sek = (Date.now() - czasStart) / 1000;
  if (blobNagrania.size < 1500 || sek < 1) {
    V.blad('Nagranie jest za krótkie', 'Nic nie zostało nagrane — spróbuj jeszcze raz i mów chwilę dłużej.');
    return;
  }
  if (blobNagrania.size > VOICE_MAX_B) {
    V.blad('Nagranie jest za duże', 'Nagraj krócej — do 60 sekund w zupełności wystarczy.');
    return;
  }

  const audio = document.getElementById('voice-audio');
  audio.src = URL.createObjectURL(blobNagrania);
  V.pokaz('voice-review');
}

/* ---------- wysyłka ---------- */
async function wyslijNagranie() {
  if (!blobNagrania) { V.blad('Brak nagrania', 'Nagraj wiadomość jeszcze raz.'); return; }

  const przycisk = document.getElementById('voice-send');
  przycisk.disabled = true;
  przycisk.textContent = 'Wysyłam…';

  // bez pośrednika: uczciwie mówimy, że kanał nie jest jeszcze podłączony
  if (!endpoint()) {
    przycisk.disabled = false;
    przycisk.textContent = 'Wyślij wiadomość';
    V.blad(
      'Kanał głosowy jest w przygotowaniu',
      'Nagranie zostało zrobione poprawnie, ale odbiorca nie jest jeszcze podłączony. Zadzwoń: 888 028 092.'
    );
    return;
  }

  try {
    const fd = new FormData();
    fd.append('audio', blobNagrania, 'nagranie.ogg');
    fd.append('imie', (document.getElementById('voice-name').value || '').trim());
    fd.append('telefon', (document.getElementById('voice-phone').value || '').trim());
    fd.append('termin', window.LT_VOICE_TERMIN || '');
    fd.append('strona', location.href);

    const odp = await fetch(endpoint(), { method: 'POST', body: fd });
    const j = await odp.json().catch(() => ({}));

    if (odp.ok && j.ok) {
      document.getElementById('voice-ticket').textContent = j.id || '—';
      V.pokaz('voice-done');
      blobNagrania = null;
    } else if (j.id) {
      // serwer zapisał, ale wysyłka do Telegrama padła — zgłoszenie nie ginie
      document.getElementById('voice-ticket').textContent = j.id;
      V.pokaz('voice-done');
      blobNagrania = null;
    } else {
      V.blad('Nie udało się wysłać', j.blad || 'Spróbuj ponownie albo zadzwoń: 888 028 092.');
    }
  } catch (e) {
    V.blad('Brak połączenia', 'Nie dotarliśmy do serwera. Sprawdź internet albo zadzwoń: 888 028 092.');
  } finally {
    przycisk.disabled = false;
    przycisk.textContent = 'Wyślij wiadomość';
  }
}

/* ---------- podłączenie zdarzeń ---------- */
function inicjujGlos() {
  const otworz = document.getElementById('voice-open');
  if (!otworz || !V.modal()) return;

  otworz.addEventListener('click', otworzModal);
  document.getElementById('voice-close').addEventListener('click', zamknijModal);
  V.modal().addEventListener('click', e => { if (e.target === V.modal()) zamknijModal(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !V.modal().hidden) zamknijModal();
  });

  document.getElementById('voice-start').addEventListener('click', startNagrywania);
  document.getElementById('voice-stop').addEventListener('click', zatrzymajNagrywanie);
  document.getElementById('voice-cancel').addEventListener('click', () => { zatrzymajWszystko(); V.pokaz('voice-idle'); });
  document.getElementById('voice-redo').addEventListener('click', () => {
    if (blobNagrania) { URL.revokeObjectURL(document.getElementById('voice-audio').src); blobNagrania = null; }
    V.pokaz('voice-idle');
    startNagrywania();
  });
  document.getElementById('voice-send').addEventListener('click', wyslijNagranie);
  document.getElementById('voice-retry').addEventListener('click', () => {
    V.pokaz(blobNagrania ? 'voice-review' : 'voice-idle');
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', inicjujGlos);
} else {
  inicjujGlos();
}
