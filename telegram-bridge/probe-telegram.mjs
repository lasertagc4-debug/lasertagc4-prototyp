/* Sprawdzenie: czy Telegram przyjmuje głosówkę OGG/Opus wysłaną botem. */
import { execSync } from 'node:child_process';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT = process.env.TG_TEST_CHAT;

(async () => {
  console.log('bot:', TOKEN ? 'token obecny' : 'BRAK TOKENU');
  if (!CHAT) { console.log('BRAK TG_TEST_CHAT'); process.exit(1); }

  const me = await (await fetch(`https://api.telegram.org/bot${TOKEN}/getMe`)).json();
  console.log('identyfikacja:', me.ok ? '@' + me.result.username : JSON.stringify(me));

  // 1. zwykła wiadomość tekstowa — czy kanał w ogóle działa
  const t = await (await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: 'POST', headers: {'content-type':'application/json'},
    body: JSON.stringify({ chat_id: CHAT, text: 'Test kanału z formularza strony Laser Tag C4 — weryfikacja.' })
  })).json();
  console.log('sendMessage:', t.ok ? 'OK' : JSON.stringify(t));
  if (!t.ok) process.exit(1);

  // 2. głosówka — prawdziwy plik audio
  const fs = await import('node:fs');
  const file = process.argv[2];
  if (!file) { console.log('brak pliku audio do testu głosówki'); process.exit(0); }
  const fd = new FormData();
  fd.append('chat_id', String(CHAT));
  fd.append('voice', new Blob([fs.readFileSync(file)], { type: 'audio/ogg' }), 'nagranie.ogg');
  const v = await (await fetch(`https://api.telegram.org/bot${TOKEN}/sendVoice`, { method:'POST', body: fd })).json();
  console.log('sendVoice:', v.ok ? 'OK — plik wysłany' : JSON.stringify(v));
})();
