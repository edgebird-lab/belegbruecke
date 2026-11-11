# Belegbrücke – Lizenzen Dritter

Erzeugt mit `node scripts/lizenzen.mjs` aus `package-lock.json` und `vendor/artefakte.json`; nicht von Hand ändern.

## Besonderheit SaxonJS

`saxon-js` (Prüfung, Ansicht) und `xslt3` (Kompilierung, nur Entwicklung) stehen unter der proprietären **Saxonica-Lizenz** (kostenlos). Nutzung und Weitergabe als Teil einer Anwendung sind erlaubt, wenn der Copyright-Hinweis beiliegt (`node_modules/saxon-js/LICENSE.txt`), kein Reverse Engineering erfolgt, nicht mit dem Namen Saxonica geworben wird und die Weitergabe nicht auf Seiten geschieht, deren Hauptzweck die Verteilung ist (Spezifikation 7.1). Vor einer Veröffentlichung der Belegbrücke ist die Lizenzfrage zu klären (offene Frage 9).

## Prüfartefakte

| Artefakt | Version | Lizenz |
| --- | --- | --- |
| KoSIT Validator-Konfiguration XRechnung | v2026-08-31 (XRechnung 3.0.2, CEN-Schematron 1.3.16, XRechnung-Schematron 2.6.0) | Apache-2.0; darin CEN-Schematron EUPL-1.2 |
| KoSIT XRechnung-Visualisierung | v2026-10-13 | Apache-2.0; Schriften im Ordner conf/fonts unter OFL-1.1 |
| KoSIT XRechnung-Testsuite | v2026-08-31 (86 positive Testdateien) | Apache-2.0 |
| KoSIT-Validator (Java, nur Referenzlauf) | 1.6.3 | Apache-2.0 |
| Mustang-CLI (Java, nur Referenzlauf) | 2.26.0 | Apache-2.0 |

Lizenztexte in `vendor/lizenzen/`, Herkunft in `vendor/LIZENZEN.md`.

## Laufzeit-Abhängigkeiten (105 Pakete)

Lizenzen: MIT (94), BSD-2-Clause (5), (MIT OR EUPL-1.1+) (1), BSD-3-Clause (1), MIT-0 (1), Apache-2.0 (1), SEE LICENSE IN LICENSE.txt (1), ISC (1).

| Paket | Version | Lizenz |
| --- | --- | --- |
| @hono/node-server | 2.1.6 | MIT |
| @napi-rs/canvas | 1.1.0 | MIT |
| @napi-rs/canvas-android-arm64 | 1.1.0 | MIT |
| @napi-rs/canvas-darwin-arm64 | 1.1.0 | MIT |
| @napi-rs/canvas-darwin-x64 | 1.1.0 | MIT |
| @napi-rs/canvas-linux-arm-gnueabihf | 1.1.0 | MIT |
| @napi-rs/canvas-linux-arm64-gnu | 1.1.0 | MIT |
| @napi-rs/canvas-linux-arm64-musl | 1.1.0 | MIT |
| @napi-rs/canvas-linux-riscv64-gnu | 1.1.0 | MIT |
| @napi-rs/canvas-linux-x64-gnu | 1.1.0 | MIT |
| @napi-rs/canvas-linux-x64-musl | 1.1.0 | MIT |
| @napi-rs/canvas-win32-arm64-msvc | 1.1.0 | MIT |
| @napi-rs/canvas-win32-x64-msvc | 1.1.0 | MIT |
| @nodable/entities | 3.1.0 | MIT |
| @pinojs/redact | 0.4.0 | MIT |
| @selderee/plugin-htmlparser2 | 0.12.0 | MIT |
| @types/node | 24.19.2 | MIT |
| @zone-eu/mailsplit | 5.4.30 | (MIT OR EUPL-1.1+) |
| agent-base | 6.0.2 | MIT |
| anynum | 1.0.1 | MIT |
| asynckit | 0.4.0 | MIT |
| atomic-sleep | 1.0.0 | MIT |
| axios | 1.21.1 | MIT |
| call-bind-apply-helpers | 1.0.2 | MIT |
| combined-stream | 1.0.8 | MIT |
| debug | 4.4.3 | MIT |
| deepmerge-ts | 8.0.2 | BSD-3-Clause |
| delayed-stream | 1.0.0 | MIT |
| dom-serializer | 2.0.0 | MIT |
| domelementtype | 2.3.0 | BSD-2-Clause |
| domhandler | 5.0.3 | BSD-2-Clause |
| domutils | 3.2.2 | BSD-2-Clause |
| dunder-proto | 1.0.1 | MIT |
| encoding-japanese | 2.5.0 | MIT |
| entities | 4.5.0 | BSD-2-Clause |
| entities | 7.0.1 | BSD-2-Clause |
| es-define-property | 1.0.1 | MIT |
| es-errors | 1.3.0 | MIT |
| es-object-atoms | 1.1.2 | MIT |
| es-set-tostringtag | 2.1.0 | MIT |
| fast-xml-builder | 1.3.1 | MIT |
| fast-xml-parser | 5.12.0 | MIT |
| fflate | 0.8.3 | MIT |
| follow-redirects | 1.16.3 | MIT |
| form-data | 4.0.6 | MIT |
| function-bind | 1.1.2 | MIT |
| get-intrinsic | 1.3.0 | MIT |
| get-proto | 1.0.1 | MIT |
| gopd | 1.2.0 | MIT |
| has-symbols | 1.1.0 | MIT |
| has-tostringtag | 1.0.2 | MIT |
| hasown | 2.0.4 | MIT |
| he | 1.2.0 | MIT |
| hono | 4.13.17 | MIT |
| html-to-text | 10.0.1 | MIT |
| htmlparser2 | 10.1.0 | MIT |
| https-proxy-agent | 5.0.1 | MIT |
| iconv-lite | 0.7.3 | MIT |
| imapflow | 2.11.0 | MIT |
| ip-address | 10.7.6 | MIT |
| is-unsafe | 2.0.3 | MIT |
| leac | 0.7.0 | MIT |
| libbase64 | 1.4.1 | MIT |
| libmime | 5.6.4 | MIT |
| libqp | 3.0.1 | MIT |
| linkify-it | 5.0.2 | MIT |
| mailparser | 3.14.3 | MIT |
| math-intrinsics | 1.1.0 | MIT |
| mime-db | 1.52.0 | MIT |
| mime-types | 2.1.35 | MIT |
| ms | 2.1.3 | MIT |
| nodemailer | 10.5.0 | MIT-0 |
| on-exit-leak-free | 2.1.2 | MIT |
| parseley | 0.13.1 | MIT |
| path-expression-matcher | 1.6.2 | MIT |
| pdfjs-dist | 6.5.438 | Apache-2.0 |
| peberminta | 0.10.0 | MIT |
| pino | 10.3.1 | MIT |
| pino-abstract-transport | 3.0.0 | MIT |
| pino-std-serializers | 7.1.0 | MIT |
| process-warning | 5.1.1 | MIT |
| proxy-from-env | 2.1.0 | MIT |
| punycode.js | 2.3.1 | MIT |
| quick-format-unescaped | 4.0.4 | MIT |
| react | 19.3.1 | MIT |
| react-dom | 19.3.1 | MIT |
| real-require | 0.2.0 | MIT |
| real-require | 1.0.0 | MIT |
| safe-stable-stringify | 2.5.0 | MIT |
| safer-buffer | 2.1.2 | MIT |
| saxon-js | 2.7.0 | SEE LICENSE IN LICENSE.txt |
| scheduler | 0.28.0 | MIT |
| selderee | 0.12.0 | MIT |
| smart-buffer | 4.2.0 | MIT |
| socks | 2.8.10 | MIT |
| sonic-boom | 4.2.1 | MIT |
| split2 | 4.2.0 | ISC |
| strnum | 2.5.1 | MIT |
| thread-stream | 4.2.1 | MIT |
| tlds | 1.261.0 | MIT |
| uc.micro | 2.1.0 | MIT |
| undici-types | 7.24.6 | MIT |
| xml-naming | 0.3.0 | MIT |
| xmllint-wasm | 5.3.0 | MIT |
| zod | 4.6.7 | MIT |

Entwicklungswerkzeuge (Vite, TypeScript, Vitest, Playwright, axe, oxlint, xslt3, rolldown, Tauri-CLI) sind nicht Teil der ausgelieferten App; ihre Lizenzen stehen in `package-lock.json`.

## Windows-Programm

Das Windows-Programm (Phase 7) liefert zusätzlich mit:

- **Node.js** (MIT, mit den Lizenzen seiner Bestandteile) als Laufzeit des Servers: `belegbruecke-server.exe` ist die unveränderte `node.exe` mit der Signatur der OpenJS Foundation.
- Die Laufzeit-Abhängigkeiten oben, mit rolldown gebündelt in `server.mjs`, `worker.mjs` und `saxon.cjs`. `scripts/programm-server.mjs` legt die Lizenztexte dieser Pakete (darunter der Saxonica-Hinweis) und von Node.js als `LIZENZEN.txt` neben das Bündel; die Lizenzen der KoSIT- und CEN-Artefakte liegen dort in `vendor/lizenzen/`.
- Die Tauri-Hülle (Rust: `tauri`, `tauri-plugin-single-instance`, `windows-sys` und deren Abhängigkeiten, überwiegend MIT oder Apache-2.0; Liste in `src-tauri/Cargo.lock`). WebView2 gehört zu Windows und wird bei Bedarf über den Bootstrapper von Microsoft nachinstalliert.
