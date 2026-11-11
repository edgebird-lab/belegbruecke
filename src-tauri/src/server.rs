//! Der Server der Belegbrücke als Sidecar (Spezifikation 7.8, Weg A).
//!
//! Die Hülle startet `belegbruecke-server.exe` (die unveränderte node.exe) mit `server.mjs`:
//! ohne geerbte Umgebung (kein NODE_OPTIONS), ohne Konsolenfenster und in einem Job-Objekt, das
//! den Server mit dem Programm beendet, auch nach einem Absturz. Der Server meldet auf stdout
//! `BELEGBRUECKE-BEREIT <port> <token>` (siehe src/server/programm.ts); stdin bleibt offen, bis die
//! Hülle ihn schließt. Daraufhin beendet sich der Server sauber.

use std::{
    fs::{self, File},
    io::{BufRead, BufReader, Read, Write},
    path::PathBuf,
    process::{Child, ChildStdin, Command, ExitStatus, Stdio},
    sync::{
        mpsc::{self, RecvTimeoutError},
        Arc, Mutex,
    },
    thread,
    time::{Duration, Instant},
};

pub const BEREIT: &str = "BELEGBRUECKE-BEREIT";
/// Erster Start: Datenbank anlegen, Prüf-Worker laden; ein Virenscanner prüft node.exe beim ersten Mal.
const START_ZEIT: Duration = Duration::from_secs(90);
/// So lange darf sich der Server nach dem Schließen von stdin Zeit lassen (er selbst nimmt sich 8 s).
const ENDE_ZEIT: Duration = Duration::from_secs(10);
/// Mehr braucht Node unter Windows nicht; alles andere, z. B. NODE_OPTIONS, bleibt draußen.
const UEBERNEHMEN: [&str; 4] = ["SystemRoot", "SystemDrive", "TEMP", "TMP"];
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Wo Laufzeit, Bündel und Daten liegen.
pub struct Pfade {
    /// belegbruecke-server.exe neben dem Programm
    pub laufzeit: PathBuf,
    /// Ordner mit server.mjs, Oberfläche und Prüfartefakten (Ressourcen des Programms)
    pub server: PathBuf,
    /// Programmordner des Benutzers: %LOCALAPPDATA%\de.olbricht-digital.belegbruecke
    pub basis: PathBuf,
}

impl Pfade {
    /// Datenordner; die Schlüsseldatei für das Postfach-Passwort liegt daneben (daten.schluessel).
    pub fn daten(&self) -> PathBuf {
        self.basis.join("daten")
    }
    pub fn protokoll(&self) -> PathBuf {
        self.basis.join("server.log")
    }
}

#[derive(Debug, PartialEq, Eq)]
pub struct Bereit {
    pub port: u16,
    pub token: String,
}

/// Liest die Bereit-Zeile des Servers; `None` für jede andere Zeile.
pub fn lies_bereit(zeile: &str) -> Option<Bereit> {
    let rest = zeile.trim_end_matches(['\r', '\n']).strip_prefix(BEREIT)?.strip_prefix(' ')?;
    let (port, token) = rest.split_once(' ')?;
    if port.is_empty() || port.len() > 5 || !port.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let port: u16 = port.parse().ok().filter(|p| *p != 0)?;
    if token.len() != 64 || !token.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f')) {
        return None;
    }
    Some(Bereit { port, token: token.to_string() })
}

/// Adresse, unter der das Fenster das Einmal-Token einlöst.
pub fn start_adresse(b: &Bereit) -> String {
    format!("http://127.0.0.1:{}/programm/start?token={}", b.port, b.token)
}

type Protokoll = Arc<Mutex<Option<File>>>;

fn schreibe(protokoll: &Protokoll, zeile: &str) {
    if let Some(f) = protokoll.lock().unwrap().as_mut() {
        let _ = writeln!(f, "{zeile}");
    }
}

/// server.log des letzten Starts bleibt als server.alt.log erhalten.
fn oeffne_protokoll(p: &Pfade) -> Protokoll {
    let pfad = p.protokoll();
    let _ = fs::rename(&pfad, p.basis.join("server.alt.log"));
    Arc::new(Mutex::new(File::create(&pfad).ok()))
}

/// Liest eine Ausgabe des Servers zeilenweise ins Protokoll. Die Bereit-Zeile enthält das Token und
/// kommt deshalb nicht ins Protokoll, sondern über `bereit` zur Hülle.
fn lies_ausgabe(quelle: impl Read, protokoll: Protokoll, bereit: Option<mpsc::Sender<Bereit>>) {
    let mut leser = BufReader::new(quelle);
    let mut puffer = Vec::new();
    let mut bereit = bereit;
    loop {
        puffer.clear();
        match leser.read_until(b'\n', &mut puffer) {
            Ok(0) | Err(_) => break,
            Ok(_) => {
                let zeile = String::from_utf8_lossy(&puffer);
                if let Some(b) = bereit.as_ref().and_then(|_| lies_bereit(&zeile)) {
                    schreibe(&protokoll, &format!("[Hülle] Server bereit auf 127.0.0.1:{}", b.port));
                    let _ = bereit.take().unwrap().send(b);
                } else {
                    schreibe(&protokoll, zeile.trim_end());
                }
            }
        }
    }
}

pub struct Server {
    kind: Child,
    stdin: Option<ChildStdin>,
    protokoll: Protokoll,
    _job: Option<job::Job>,
}

impl Server {
    /// Startet den Server und wartet auf seine Bereit-Zeile.
    pub fn starte(p: &Pfade) -> Result<(Server, Bereit), String> {
        fs::create_dir_all(&p.basis).map_err(|e| format!("Der Programmordner {} lässt sich nicht anlegen: {e}", p.basis.display()))?;
        let skript = p.server.join("server.mjs");
        for datei in [&p.laufzeit, &skript] {
            if !datei.is_file() {
                return Err(format!("Eine Programmdatei fehlt: {}. Bitte die Belegbrücke neu installieren.", datei.display()));
            }
        }
        let protokoll = oeffne_protokoll(p);
        schreibe(&protokoll, &format!("[Hülle] Start: {} {}", p.laufzeit.display(), skript.display()));

        let mut befehl = Command::new(&p.laufzeit);
        befehl.arg(&skript).current_dir(&p.basis).env_clear();
        for name in UEBERNEHMEN {
            if let Some(wert) = std::env::var_os(name) {
                befehl.env(name, wert);
            }
        }
        befehl
            .env("BB_DATEN", p.daten())
            .env("BB_VENDOR", p.server.join("vendor"))
            .env("BB_OBERFLAECHE", p.server.join("oberflaeche"))
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            befehl.creation_flags(CREATE_NO_WINDOW);
        }
        let mut kind = befehl.spawn().map_err(|e| format!("Der Server lässt sich nicht starten ({}): {e}", p.laufzeit.display()))?;
        schreibe(&protokoll, &format!("[Hülle] Server läuft mit PID {}", kind.id()));
        let job = match job::Job::fuer(&kind) {
            Ok(j) => Some(j),
            Err(e) => {
                schreibe(&protokoll, &format!("[Hülle] Job-Objekt nicht verfügbar ({e}); der Server endet trotzdem mit stdin."));
                None
            }
        };

        let (tx, rx) = mpsc::channel();
        let stdout = kind.stdout.take().expect("stdout ist umgeleitet");
        let stderr = kind.stderr.take().expect("stderr ist umgeleitet");
        let p1 = protokoll.clone();
        thread::spawn(move || lies_ausgabe(stdout, p1, Some(tx)));
        let p2 = protokoll.clone();
        thread::spawn(move || lies_ausgabe(stderr, p2, None));
        let stdin = kind.stdin.take();
        let mut server = Server { kind, stdin, protokoll, _job: job };

        let ende = Instant::now() + START_ZEIT;
        loop {
            match rx.recv_timeout(Duration::from_millis(100)) {
                Ok(b) => return Ok((server, b)),
                Err(RecvTimeoutError::Timeout) if Instant::now() < ende => {
                    if let Ok(Some(status)) = server.kind.try_wait() {
                        return Err(format!("Der Server hat sich beim Start beendet ({status})."));
                    }
                }
                Err(RecvTimeoutError::Timeout) => return Err(format!("Der Server meldet sich nicht (Zeitlimit {} s).", START_ZEIT.as_secs())),
                Err(RecvTimeoutError::Disconnected) => {
                    let status = server.kind.wait().map(|s| s.to_string()).unwrap_or_default();
                    return Err(format!("Der Server hat sich beim Start beendet ({status})."));
                }
            }
        }
    }

    /// Schließt stdin; der Server beendet sich dann selbst sauber. Nach 10 s wird er hart beendet.
    fn beenden(&mut self) -> Option<ExitStatus> {
        drop(self.stdin.take());
        let ende = Instant::now() + ENDE_ZEIT;
        while Instant::now() < ende {
            match self.kind.try_wait() {
                Ok(Some(status)) => return Some(status),
                Ok(None) => thread::sleep(Duration::from_millis(50)),
                Err(_) => break,
            }
        }
        let _ = self.kind.kill();
        self.kind.wait().ok()
    }
}

impl Drop for Server {
    fn drop(&mut self) {
        let status = self.beenden();
        schreibe(&self.protokoll, &format!("[Hülle] Server beendet ({})", status.map(|s| s.to_string()).unwrap_or_else(|| "unbekannt".into())));
    }
}

/// Wert für das Fragment der Ladeseite: alles außer A–Z, a–z, 0–9 und -_.~ prozentkodiert, damit
/// `decodeURIComponent` es sicher zurückliest.
pub fn kodiere(text: &str) -> String {
    let mut aus = String::with_capacity(text.len() * 3);
    for b in text.bytes() {
        if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~') {
            aus.push(b as char);
        } else {
            aus.push_str(&format!("%{b:02X}"));
        }
    }
    aus
}

#[cfg(windows)]
mod job {
    use std::{os::windows::io::AsRawHandle, process::Child};
    use windows_sys::Win32::{
        Foundation::{CloseHandle, GetLastError, HANDLE},
        System::JobObjects::{
            AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation, SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
            JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
        },
    };

    /// Job-Objekt mit „beim Schließen beenden“: Endet das Programm, egal wie, schließt Windows den
    /// letzten Verweis auf den Job und beendet den Server.
    pub struct Job(HANDLE);

    // Der Verweis gehört allein diesem Wert; Windows erlaubt die Nutzung aus jedem Thread.
    unsafe impl Send for Job {}
    unsafe impl Sync for Job {}

    impl Job {
        pub fn fuer(kind: &Child) -> Result<Job, String> {
            unsafe {
                let h = CreateJobObjectW(std::ptr::null(), std::ptr::null());
                if h.is_null() {
                    return Err(format!("CreateJobObjectW: Fehler {}", GetLastError()));
                }
                let job = Job(h);
                let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
                info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
                let groesse = std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32;
                if SetInformationJobObject(job.0, JobObjectExtendedLimitInformation, &info as *const _ as *const _, groesse) == 0 {
                    return Err(format!("SetInformationJobObject: Fehler {}", GetLastError()));
                }
                if AssignProcessToJobObject(job.0, kind.as_raw_handle() as HANDLE) == 0 {
                    return Err(format!("AssignProcessToJobObject: Fehler {}", GetLastError()));
                }
                Ok(job)
            }
        }
    }

    impl Drop for Job {
        fn drop(&mut self) {
            unsafe {
                CloseHandle(self.0);
            }
        }
    }
}

#[cfg(not(windows))]
mod job {
    pub struct Job;
    impl Job {
        pub fn fuer(_kind: &std::process::Child) -> Result<Job, String> {
            Err("nur unter Windows".into())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const TOKEN: &str = "8dbb85d32c88412ce66e60523197a570676492ae4b766b576aaea88b886f6b8b";

    #[test]
    fn liest_die_bereit_zeile() {
        let b = lies_bereit(&format!("BELEGBRUECKE-BEREIT 64439 {TOKEN}\n")).unwrap();
        assert_eq!(b, Bereit { port: 64439, token: TOKEN.into() });
        assert_eq!(lies_bereit(&format!("BELEGBRUECKE-BEREIT 1 {TOKEN}\r\n")).map(|b| b.port), Some(1));
        assert_eq!(start_adresse(&b), format!("http://127.0.0.1:64439/programm/start?token={TOKEN}"));
    }

    #[test]
    fn verwirft_alles_andere() {
        let falsch = [
            "Belegbrücke 0.1.0 läuft auf http://127.0.0.1:64439".to_string(),
            format!("BELEGBRUECKE-BEREIT 0 {TOKEN}"),
            format!("BELEGBRUECKE-BEREIT 65536 {TOKEN}"),
            format!("BELEGBRUECKE-BEREIT +80 {TOKEN}"),
            format!("BELEGBRUECKE-BEREIT -1 {TOKEN}"),
            format!("BELEGBRUECKE-BEREIT  64439 {TOKEN}"),
            format!("BELEGBRUECKE-BEREIT 64439 {}", &TOKEN[1..]),
            format!("BELEGBRUECKE-BEREIT 64439 {}", TOKEN.to_uppercase()),
            format!("BELEGBRUECKE-BEREIT 64439 {TOKEN} mehr"),
            format!("BELEGBRUECKE-BEREIT 64439 {TOKEN}&x=1"),
            format!("XBELEGBRUECKE-BEREIT 64439 {TOKEN}"),
            "BELEGBRUECKE-BEREIT".to_string(),
            String::new(),
        ];
        for z in falsch {
            assert_eq!(lies_bereit(&z), None, "{z}");
        }
    }

    #[test]
    fn kodiert_fehlertexte_fuer_das_fragment() {
        assert_eq!(kodiere("Fehler: 100 % weg\nZeile 2"), "Fehler%3A%20100%20%25%20weg%0AZeile%202");
        assert_eq!(kodiere("Prüfung"), "Pr%C3%BCfung");
        assert_eq!(kodiere("a-b_c.d~e"), "a-b_c.d~e");
    }

    #[test]
    fn protokolliert_ohne_token_und_meldet_bereit_einmal() {
        let ordner = std::env::temp_dir().join("belegbruecke-test-ausgabe");
        let _ = fs::remove_dir_all(&ordner);
        fs::create_dir_all(&ordner).unwrap();
        let datei = ordner.join("server.log");
        let protokoll: Protokoll = Arc::new(Mutex::new(Some(File::create(&datei).unwrap())));
        // Die zweite Bereit-Zeile wird nicht mehr ausgewertet; ungültiges UTF-8 bricht das Lesen nicht ab
        let mut ausgabe = format!("Belegbrücke läuft\nBELEGBRUECKE-BEREIT 4711 {TOKEN}\nBELEGBRUECKE-BEREIT 4712 {TOKEN}\nkaputt ").into_bytes();
        ausgabe.extend_from_slice(b"\xff\nnoch da\n");
        let (tx, rx) = mpsc::channel();
        lies_ausgabe(ausgabe.as_slice(), protokoll.clone(), Some(tx));
        assert_eq!(rx.try_recv().unwrap().port, 4711);
        assert!(rx.try_recv().is_err());
        drop(protokoll);
        let text = fs::read_to_string(&datei).unwrap();
        assert!(text.contains("Belegbrücke läuft"));
        assert!(text.contains("Server bereit auf 127.0.0.1:4711"));
        assert_eq!(text.matches(TOKEN).count(), 1, "nur die zweite, nicht ausgewertete Zeile steht im Protokoll");
        assert!(text.contains("noch da"));
        let _ = fs::remove_dir_all(&ordner);
    }

    #[cfg(windows)]
    #[test]
    fn job_objekt_beendet_den_prozess_beim_schliessen() {
        // Ein Prozess, der sonst 60 s liefe; mit dem Job endet er, sobald der Job geschlossen wird.
        let mut kind = Command::new("cmd").args(["/c", "ping -n 60 127.0.0.1 >nul"]).creation_flags_ohne_fenster().spawn().unwrap();
        let job = job::Job::fuer(&kind).unwrap();
        assert!(kind.try_wait().unwrap().is_none());
        drop(job);
        let ende = Instant::now() + Duration::from_secs(10);
        while kind.try_wait().unwrap().is_none() {
            assert!(Instant::now() < ende, "Prozess läuft nach dem Schließen des Jobs weiter");
            thread::sleep(Duration::from_millis(50));
        }
    }

    #[cfg(windows)]
    trait OhneFenster {
        fn creation_flags_ohne_fenster(&mut self) -> &mut Self;
    }
    #[cfg(windows)]
    impl OhneFenster for Command {
        fn creation_flags_ohne_fenster(&mut self) -> &mut Self {
            use std::os::windows::process::CommandExt;
            self.creation_flags(CREATE_NO_WINDOW)
        }
    }
}
