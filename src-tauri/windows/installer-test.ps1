# Prüft den Installer auf einem frischen Windows (in der CI, nicht auf Robins Rechner):
# still installieren, Programmdateien und Verknüpfungen prüfen, den installierten Server mit dem
# API-Test starten, still deinstallieren. Die Daten des Benutzers bleiben dabei erhalten.
$ErrorActionPreference = 'Stop'

$setup = Get-ChildItem 'src-tauri/target/release/bundle/nsis/*-setup.exe' | Select-Object -First 1
if (-not $setup) { throw 'Kein Installer gefunden.' }
Write-Host ("Installer {0}: {1:N1} MB" -f $setup.Name, ($setup.Length / 1MB))
Write-Host 'Installiere still ...'
Start-Process $setup.FullName -ArgumentList '/S' -Wait

# Produktname mit Umlaut, ohne Umlaut im Skript (unabhängig von der Kodierung der Datei)
$name = "Belegbr$([char]0x00FC)cke"
$ordner = Join-Path $env:LOCALAPPDATA $name
$exe = Join-Path $ordner 'belegbruecke.exe'
$server = Join-Path $ordner 'belegbruecke-server.exe'
$buendel = Join-Path $ordner 'belegbruecke-server'
foreach ($datei in @($exe, $server, (Join-Path $buendel 'server.mjs'), (Join-Path $buendel 'worker.mjs'), (Join-Path $buendel 'node_modules\saxon-js\SaxonJS2N.js'), (Join-Path $buendel 'node_modules\saxon-js\LICENSE.txt'), (Join-Path $buendel 'node_modules\axios\index.js'),(Join-Path $buendel 'xmllint.wasm'), (Join-Path $buendel 'oberflaeche\index.html'), (Join-Path $buendel 'vendor\sef\verzeichnis.json'), (Join-Path $buendel 'LIZENZEN.txt'))) {
  if (-not (Test-Path $datei)) { throw "Nicht installiert: $datei" }
}
$groesse = (Get-ChildItem $ordner -Recurse -File | Measure-Object Length -Sum).Sum
Write-Host ("Installiert in {0}: {1:N1} MB" -f $ordner, ($groesse / 1MB))

# Die Laufzeit ist die unveränderte node.exe mit gültiger Signatur
$signatur = Get-AuthenticodeSignature $server
if ($signatur.Status -ne 'Valid') { throw "Signatur der Laufzeit: $($signatur.Status)" }

$startmenue = Join-Path ([Environment]::GetFolderPath('Programs')) "$name.lnk"
if (-not (Test-Path $startmenue)) { throw "Startmenü-Eintrag fehlt: $startmenue" }

# Der installierte Server besteht den API-Test (Prüfung und PDF im Worker)
$env:PROGRAMM_SERVER_EXE = $server
$env:PROGRAMM_SERVER_ORDNER = $buendel
node scripts/programm-server-test.mjs
if ($LASTEXITCODE -ne 0) { throw 'API-Test der installierten Fassung fehlgeschlagen' }

# Vorhandene Daten des Benutzers dürfen die Deinstallation überstehen (GoBD-Archiv)
$daten = Join-Path $env:LOCALAPPDATA 'de.olbricht-digital.belegbruecke\daten'
New-Item -ItemType Directory -Force $daten | Out-Null
Set-Content (Join-Path $daten 'marke.txt') 'bleibt'

Write-Host 'Installation in Ordnung, deinstalliere still ...'
Start-Process (Join-Path $ordner 'uninstall.exe') -ArgumentList '/S' -Wait
# Der Deinstaller startet sich aus einer Kopie neu; kurz warten, bis er fertig ist
for ($i = 0; $i -lt 30 -and (Test-Path $exe); $i++) { Start-Sleep -Seconds 1 }

if (Test-Path $exe) { throw 'Programm nach der Deinstallation noch vorhanden' }
if (Test-Path $server) { throw 'Server nach der Deinstallation noch vorhanden' }
if (-not (Test-Path (Join-Path $daten 'marke.txt'))) { throw 'Die Deinstallation hat die Daten des Benutzers gelöscht' }
Write-Host 'Installer-Test bestanden.'
