# Prototyp strony Laser Tag C4 Ełk

Statyczny prototyp wykonany na podstawie audytu (`../.audyt_strony.md`).
Nie jest to projekt graficzny „do obejrzenia" — to działająca strona z realną logiką weryfikacji terminów.

## Jak uruchomić

Otwórz `index.html` w przeglądarce. Działa bez serwera (wszystko jest lokalne poza zdjęciami i czcionkami).

Jeśli chcesz testować na telefonie w sieci lokalnej:

```bash
cd prototyp
python -m http.server 8099
# telefon: http://<IP-komputera>:8099/
```

## Co tu jest zrobione inaczej niż na obecnej stronie

| # | Zmiana | Skąd w audycie |
|---|---|---|
| 1 | Własna domena, brak paska reklamy Wixa | 4.1, 4.2 |
| 2 | Poprawione wszystkie literówki (Ł→LL), pełne logo | 4.10, 4.11 |
| 3 | Pasek ocen 4,8/5 · 191 opinii w pierwszym ekranie | sekcja 7, quick win |
| 4 | Numer telefonu klikalny + stały pasek na dole ekranu mobilnego | 4.7 |
| 5 | **Weryfikacja terminu w kalendarzu** z buforami (sekcja 11.1 audytu) | 11.1 |
| 6 | Generator propozycji: wcześniej → później → najbliższe dni | 11.1.1 |
| 7 | Przycisk „Wyślij i czekaj na potwierdzenie SMS-em" + blokada 2 h | 11.1.3 |
| 8 | Cennik w karty, wyróżniony pakiet, cena za osobę | 4.9 |
| 9 | Dane strukturalne LocalBusiness + FAQPage (widoczność w Google i AI) | 4.4, 9.1 |
| 10 | Przewodnik dojazdu krok po kroku (zamiast zrzutu z mapy) | 4.12 |
| 11 | Linki do Facebooka i Instagrama w stopce i nagłówku | 4.6 |
| 12 | FAQ, regulamin, polityka prywatności — jako miejsca pod treść | 5 |
| 13 | Panel dla firm (brakujący segment) | 7.2 |
| 14 | Informatywna walidacja formularza zamiast alertów | 4.8 |
| 15 | Pasek postępu rezerwacji | UX |

## Silnik terminów — logika

```
okno zajęcia sali = czas pakietu + 15 min przygotowania + 15 min resetu + 15 min bufora
pakiet 2,5 h → 3 h 15 min zajęcia
pakiet 3 h   → 3 h 45 min
pakiet 4 h   → 4 h 45 min
```

Wolny slot = okno mieści się między sąsiednimi rezerwacjami (licząc ich bufory) i nie wychodzi poza 10:00–21:00.

Propozycje, gdy brak okna: **a)** najbliższa wcześniejsza godzina tego samego dnia → **b)** najbliższa późniejsza → **c)** najbliższe dni (do 21 dni wprzód), maks. 5 propozycji.

## Testy

```bash
node test-silnik.js          # 29 testów logiki (bez przeglądarki)
node test-przegladarka.js    # 29 testów w Chromium: treść, SEO, interakcje, mobile
```

Oba zestawy: **29/29 OK**.

## Co jest atrapą (i co trzeba podłączyć przed wdrożeniem)

| Element | Stan | Co zrobić |
|---|---|---|
| Kalendarz | dane demo generowane lokalnie (`losowyKalendarz`) | podmienić na Google Calendar API — format danych identyczny, jedna funkcja |
| SMS | tylko komunikat na ekranie | SMSAPI.pl / Twilio + konto |
| Wysyłka formularza | `console.log` + potwierdzenie na stronie | endpoint (Wix Forms, Supabase, własne API) + e-mail do ekipy |
| Powiadomienie ekipy | brak | bot Telegram (macie grupę) |
| Ranking | 5 wierszy statycznych z realnymi danymi z `gamestats.devsphp.pl` | API od Kamila (punkt 5 prośby w audycie) |
| Regulamin / polityka | linki prowadzą do `#` | wstawić treść |
| Zdjęcia | linkowane z serwerów Wixa | przenieść na własny hosting po podpięciu domeny |

**Ważna uwaga prawna:** gracze na zdjęciach (w tym dzieci) są rozpoznawalni. Przed publikacją nowej strony potrzeba zgód na wizerunek. Na stronie firmowej to nie „drobiazg" — przy RODO i osobach nieletnich to realne ryzyko.

## Struktura plików

```
prototyp/
├── index.html              # cała strona, treść, dane strukturalne
├── assets/
│   ├── style.css           # styling, responsywność, dostępność
│   └── app.js              # cennik, silnik terminów, kalkulator, formularz
├── test-silnik.js          # testy logiki
├── test-przegladarka.js    # testy w przeglądarce
└── shots/                  # zrzuty ekranu z testów
```

## Czego ten prototyp nie robi

- nie jest podłączony do żadnego backendu,
- nie zapisuje rezerwacji,
- nie wysyła SMS-ów ani e-maili,
- nie ma panelu pracownika (jego opis jest w audycie, sekcja 5),
- nie ma czatu o cenach (audyt, sekcja 11.3) — to osobny moduł.
