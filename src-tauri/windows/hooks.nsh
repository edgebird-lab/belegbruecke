; Das Archiv (GoBD, Aufbewahrung acht Jahre) übersteht jede Deinstallation. Hakt der Benutzer
; „Lösche die Anwendungsdaten“ an, entfallen nur Browserdaten und Protokolle des Programms; den
; Datenordner mit Datenbank, Originalen, Berichten und Sicherungen löscht man nur bewusst von Hand.
!macro NSIS_HOOK_PREUNINSTALL
  ${If} $DeleteAppDataCheckboxState = 1
    SetShellVarContext current
    RmDir /r "$LOCALAPPDATA\${BUNDLEID}\EBWebView"
    Delete "$LOCALAPPDATA\${BUNDLEID}\server.log"
    Delete "$LOCALAPPDATA\${BUNDLEID}\server.alt.log"
    StrCpy $DeleteAppDataCheckboxState 0
  ${EndIf}
!macroend
