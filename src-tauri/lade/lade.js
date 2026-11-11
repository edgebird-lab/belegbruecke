// Fehlermeldung der Hülle (Server startet nicht) aus dem Fragment der Adresse anzeigen
function zeige() {
  if (!location.hash.startsWith('#fehler=')) return
  const [meldung, ...details] = decodeURIComponent(location.hash.slice(8)).split('\n')
  document.body.classList.add('fehler')
  document.getElementById('meldung').textContent = meldung
  const pre = document.getElementById('details')
  pre.textContent = details.join('\n')
  pre.hidden = details.length === 0
}
addEventListener('hashchange', zeige)
zeige()
