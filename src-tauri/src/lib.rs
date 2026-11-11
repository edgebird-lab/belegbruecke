//! Windows-Programm der Belegbrücke (Spezifikation 7.8, Weg A).
//!
//! Die Hülle zeigt zuerst eine Ladeseite, startet den Node-Server als Sidecar (`server.rs`), wartet
//! auf seine Bereit-Zeile und öffnet im Fenster einmal die Start-Adresse mit dem Einmal-Token. Danach
//! zeigt das Fenster die Oberfläche vom Server auf 127.0.0.1. Die Oberfläche bekommt keine Rechte
//! für Tauri-Befehle (keine Capabilities); das Fenster navigiert nur zur Ladeseite und zum eigenen
//! Server, neue Fenster gibt es nicht. Schließt das Fenster, endet der Server mit.

mod server;

use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, AtomicU16, Ordering},
        Arc, Mutex,
    },
};

use tauri::{webview::NewWindowResponse, AppHandle, Manager, RunEvent, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

/// Ressourcen-Ordner mit server.mjs (tauri.conf.json, bundle.resources)
const SERVER_ORDNER: &str = "belegbruecke-server";

#[derive(Default)]
struct Zustand {
    server: Mutex<Option<server::Server>>,
    port: Arc<AtomicU16>,
    beendet: AtomicBool,
}

/// Darf das Fenster diese Adresse öffnen? Nur die eingebaute Ladeseite und der eigene Server.
pub fn navigation_erlaubt(url: &Url, port: u16) -> bool {
    match url.scheme() {
        // Ladeseite (unter Windows http://tauri.localhost, sonst tauri://localhost)
        "tauri" => url.host_str() == Some("localhost"),
        "http" if url.host_str() == Some("tauri.localhost") => url.port().is_none(),
        "http" => port != 0 && url.host_str() == Some("127.0.0.1") && url.port() == Some(port) && url.username().is_empty() && url.password().is_none(),
        // Downloads der Oberfläche (Prüferexport, Übergabe) als blob:http://127.0.0.1:<port>/…
        "blob" => Url::parse(url.path()).is_ok_and(|innen| innen.scheme() == "http" && navigation_erlaubt(&innen, port)),
        _ => false,
    }
}

fn zeige_hauptfenster(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// `\\?\C:\…` → `C:\…`: Tauri liefert den Ressourcenordner in dieser Form, Node kann damit sein
/// Startskript nicht auflösen. Netzwerkpfade (`\\?\UNC\…`) bleiben unverändert.
pub fn ohne_praefix(p: PathBuf) -> PathBuf {
    let text = p.to_string_lossy();
    match text.strip_prefix(r"\\?\") {
        Some(rest) if rest.as_bytes().get(1) == Some(&b':') && rest.as_bytes()[0].is_ascii_alphabetic() => PathBuf::from(rest),
        _ => p,
    }
}

fn pfade(app: &AppHandle) -> Result<server::Pfade, String> {
    let exe = std::env::current_exe().map_err(|e| format!("Programmordner unbekannt: {e}"))?;
    let ordner = exe.parent().ok_or("Programmordner unbekannt")?;
    let laufzeit = ohne_praefix(ordner.join(if cfg!(windows) { "belegbruecke-server.exe" } else { "belegbruecke-server" }));
    let server = ohne_praefix(app.path().resource_dir().map_err(|e| format!("Ressourcen nicht gefunden: {e}"))?.join(SERVER_ORDNER));
    let basis = ohne_praefix(app.path().app_local_data_dir().map_err(|e| format!("Programmordner des Benutzers unbekannt: {e}"))?);
    Ok(server::Pfade { laufzeit, server, basis })
}

/// Zeigt eine Fehlermeldung auf der Ladeseite (lade/lade.js liest sie aus dem Fragment).
fn zeige_fehler(fenster: &WebviewWindow, text: &str) {
    // Adresse der Ladeseite; ist das Fenster noch nicht dort, die eingebaute Adresse
    let ladeseite = if cfg!(windows) { "http://tauri.localhost/index.html" } else { "tauri://localhost/index.html" };
    let url = fenster.url().ok().filter(|u| navigation_erlaubt(u, 0)).or_else(|| Url::parse(ladeseite).ok());
    if let Some(mut url) = url {
        url.set_fragment(Some(&format!("fehler={}", server::kodiere(text))));
        let _ = fenster.navigate(url);
    }
}

fn starte_server(app: AppHandle, fenster: WebviewWindow) {
    let pfade = match pfade(&app) {
        Ok(p) => p,
        Err(e) => return zeige_fehler(&fenster, &format!("Die Belegbrücke konnte nicht starten.\n{e}")),
    };
    match server::Server::starte(&pfade) {
        Ok((s, bereit)) => {
            let zustand = app.state::<Zustand>();
            // Fenster schon geschlossen: Server gleich wieder beenden (Drop)
            if zustand.beendet.load(Ordering::SeqCst) {
                return;
            }
            zustand.port.store(bereit.port, Ordering::SeqCst);
            *zustand.server.lock().unwrap() = Some(s);
            match Url::parse(&server::start_adresse(&bereit)) {
                Ok(url) => {
                    let _ = fenster.navigate(url);
                }
                Err(e) => zeige_fehler(&fenster, &format!("Die Belegbrücke konnte nicht starten.\n{e}")),
            }
        }
        Err(e) => zeige_fehler(&fenster, &format!("Die Belegbrücke konnte nicht starten.\n{e}\nProtokoll: {}", pfade.protokoll().display())),
    }
}

/// Server sauber beenden (stdin schließen, warten); das Job-Objekt fängt den Rest ab.
fn beende_server(app: &AppHandle) {
    let zustand = app.state::<Zustand>();
    zustand.beendet.store(true, Ordering::SeqCst);
    let server = zustand.server.lock().unwrap().take();
    drop(server);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let zustand = Zustand::default();
    let port = zustand.port.clone();
    let app = tauri::Builder::default()
        // Zuerst: Ein zweiter Start öffnet keinen zweiten Server auf denselben Daten, sondern zeigt das Fenster.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| zeige_hauptfenster(app)))
        .manage(zustand)
        .setup(move |app| {
            let fenster = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Belegbrücke")
                .inner_size(1280.0, 860.0)
                .min_inner_size(900.0, 600.0)
                .center()
                // Dateien per Ziehen und Ablegen gehen an die Oberfläche (Upload), nicht an Tauri
                .disable_drag_drop_handler()
                .on_navigation(move |url| navigation_erlaubt(url, port.load(Ordering::SeqCst)))
                .on_new_window(|_url, _merkmale| NewWindowResponse::Deny)
                .build()?;
            let handle = app.handle().clone();
            std::thread::spawn(move || starte_server(handle, fenster));
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Belegbrücke konnte nicht starten");
    app.run(|app, ereignis| {
        if let RunEvent::Exit = ereignis {
            beende_server(app);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn url(s: &str) -> Url {
        Url::parse(s).unwrap()
    }

    #[test]
    fn erlaubt_ladeseite_und_eigenen_server() {
        assert!(navigation_erlaubt(&url("http://tauri.localhost/index.html"), 0));
        assert!(navigation_erlaubt(&url("http://tauri.localhost/index.html#fehler=x"), 0));
        assert!(navigation_erlaubt(&url("tauri://localhost/index.html"), 0));
        assert!(navigation_erlaubt(&url("http://127.0.0.1:51200/programm/start?token=ab"), 51200));
        assert!(navigation_erlaubt(&url("http://127.0.0.1:51200/#/eingang"), 51200));
        assert!(navigation_erlaubt(&url("http://127.0.0.1:51200/api/belege/1/original"), 51200));
        assert!(navigation_erlaubt(&url("blob:http://127.0.0.1:51200/6f1d2c3e-0000-4000-8000-000000000000"), 51200));
    }

    #[test]
    fn entfernt_das_praefix_fuer_laufwerkspfade() {
        assert_eq!(ohne_praefix(PathBuf::from(r"\\?\C:\Users\Robin\AppData\Local\Belegbrücke\belegbruecke-server")), PathBuf::from(r"C:\Users\Robin\AppData\Local\Belegbrücke\belegbruecke-server"));
        assert_eq!(ohne_praefix(PathBuf::from(r"C:\Programme\x")), PathBuf::from(r"C:\Programme\x"));
        assert_eq!(ohne_praefix(PathBuf::from(r"\\?\UNC\server\freigabe\x")), PathBuf::from(r"\\?\UNC\server\freigabe\x"));
        assert_eq!(ohne_praefix(PathBuf::from(r"\\?\")), PathBuf::from(r"\\?\"));
    }

    #[test]
    fn verbietet_alles_andere() {
        for (adresse, port) in [
            // Server noch nicht bereit
            ("http://127.0.0.1:51200/", 0),
            // anderer Port, anderer Host, andere Schemata
            ("http://127.0.0.1:51201/", 51200),
            ("http://localhost:51200/", 51200),
            ("https://127.0.0.1:51200/", 51200),
            ("http://127.0.0.2:51200/", 51200),
            ("http://tauri.localhost:8080/", 51200),
            ("https://www.bundesfinanzministerium.de/", 51200),
            ("http://user:pw@127.0.0.1:51200/", 51200),
            ("file:///C:/Windows/win.ini", 51200),
            ("blob:https://example.com/6f1d2c3e", 51200),
            ("blob:http://127.0.0.1:1/6f1d2c3e", 51200),
            ("data:text/html,<p>x</p>", 51200),
            ("javascript:alert(1)", 51200),
            ("about:blank", 51200),
        ] {
            assert!(!navigation_erlaubt(&url(adresse), port), "{adresse}");
        }
    }
}
