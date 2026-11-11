@echo off
rem Belegbruecke starten: Server auf 127.0.0.1:8784, danach den Browser oeffnen.
rem Daten liegen in .\daten (oder im Ordner aus BB_DATEN). Beenden mit Strg+C.
setlocal
cd /d "%~dp0"

where node >nul 2>nul || (echo Node.js 24 fehlt. Bitte installieren: https://nodejs.org & exit /b 1)
if not exist node_modules (
  echo Erster Start: Abhaengigkeiten werden installiert ...
  call npm install || exit /b 1
)
if not exist vendor\sef\verzeichnis.json (
  echo Pruefartefakte werden geladen und kompiliert ...
  call npm run vorbereiten || exit /b 1
)
if not exist dist\index.html (
  echo Oberflaeche wird gebaut ...
  call npm run build || exit /b 1
)

rem Browser nach kurzer Wartezeit oeffnen, waehrend der Server im Vordergrund laeuft
start "" /b cmd /c "timeout /t 4 /nobreak >nul & start "" http://127.0.0.1:8784"
node src\server\start.ts
