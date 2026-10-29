#!/bin/bash
# Uruchomienie pośrednika Telegram z kluczem z pliku .env Hermesa.
# Token nie jest zapisywany na dysku w tym katalogu — czytamy go ze zmiennej środowiskowej.
set -e
cd "$(dirname "$0")"
export TELEGRAM_BOT_TOKEN="$(grep '^TELEGRAM_BOT_TOKEN=' "$HOME/AppData/Local/hermes/.env" | cut -d= -f2- | tr -d '\r\n')"
export TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:?Ustaw TELEGRAM_CHAT_ID}"
export ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-https://lasertagc4-debug.github.io,http://127.0.0.1:8099}"
export FFMPEG="${FFMPEG:-$(command -v ffmpeg || echo ffmpeg)}"
# MSYS podaje ścieżkę /c/... — Node (program natywny) jej nie zrozumie, trzeba C:/...
if command -v cygpath >/dev/null 2>&1; then export FFMPEG="$(cygpath -w "$FFMPEG" 2>/dev/null || echo "$FFMPEG")"; fi
exec node server.mjs
