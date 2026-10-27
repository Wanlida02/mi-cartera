/* Sincronización con Google Drive (un solo archivo: mi-cartera-datos.json en tu Drive).
   Permiso mínimo: drive.file → la app solo ve el archivo que ella misma crea. Sin servidor: el navegador habla directo con Google.
   El ID de cliente no es secreto (identifica la app, no da acceso a nada). */
const Drive = (function () {
  const CLIENT_ID = '480691248279-u661oqhnte0qa5ffna3dkr6vf6c1q4gr.apps.googleusercontent.com';
  const SCOPE = 'https://www.googleapis.com/auth/drive.file', NAME = 'mi-cartera-datos.json', NAME_INF = 'mi-cartera-informes.json', MK = 'mi-cartera:drive';
  const API = 'https://www.googleapis.com/drive/v3/files', UP = 'https://www.googleapis.com/upload/drive/v3/files';
  let token = null, tokenExp = 0, client = null, estado = 'off', detalle = '', timer = null, ocupado = false, pendiente = false, onEstado = () => { }, onDatos = () => { }, preguntar = null;

  const meta = () => { try { return JSON.parse(localStorage.getItem(MK) || '{}'); } catch (e) { return {}; } };
  const setMeta = o => { try { localStorage.setItem(MK, JSON.stringify(Object.assign(meta(), o))); } catch (e) { } };
  function set(e, d) { estado = e; detalle = d || ''; onEstado(estado, detalle); }

  function cargarGIS() {
    if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
    return new Promise((ok, ko) => {
      const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
      s.onload = ok; s.onerror = () => ko(new Error('No se pudo cargar el servicio de Google (¿sin conexión?)')); document.head.appendChild(s);
    });
  }
  /* Pide un token (1 h de vida). interactivo=false intenta hacerlo sin ventana; si Google necesita tu permiso, falla y queda «reconectar». */
  async function conseguirToken(interactivo) {
    if (token && Date.now() < tokenExp - 60000) return token;
    await cargarGIS();
    return new Promise((ok, ko) => {
      client = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID, scope: SCOPE,
        callback: r => { if (r.error) return ko(new Error(r.error)); token = r.access_token; tokenExp = Date.now() + (r.expires_in || 3600) * 1000; ok(token); },
        error_callback: e => ko(new Error(e && e.type || 'cancelado'))
      });
      client.requestAccessToken({ prompt: interactivo ? (meta().on ? '' : 'consent') : '' });
    });
  }
  async function api(url, opt) {
    const r = await fetch(url, Object.assign({}, opt, { headers: Object.assign({ Authorization: 'Bearer ' + token }, (opt && opt.headers) || {}) }));
    if (r.status === 401) { token = null; throw new Error('sesión caducada'); }
    if (!r.ok) throw new Error('Drive respondió ' + r.status);
    return r;
  }
  async function buscar() {
    const r = await api(API + '?q=' + encodeURIComponent("name='" + NAME + "' and trashed=false") + '&fields=files(id,modifiedTime)&spaces=drive&pageSize=5');
    const j = await r.json(); return (j.files || []).sort((a, b) => (a.modifiedTime < b.modifiedTime ? 1 : -1))[0] || null;
  }
  async function bajar(id) { const r = await api(API + '/' + id + '?alt=media'); return r.json(); }
  async function subir(id, texto) {
    if (id) { const r = await api(UP + '/' + id + '?uploadType=media', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: texto }); return (await r.json()).id; }
    const b = '----cartera' + Date.now();
    const body = '--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify({ name: NAME, mimeType: 'application/json' }) +
      '\r\n--' + b + '\r\nContent-Type: application/json\r\n\r\n' + texto + '\r\n--' + b + '--';
    const r = await api(UP + '?uploadType=multipart&fields=id', { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + b }, body });
    return (await r.json()).id;
  }

  /* Índice de informes anuales: lo sube herramientas/indice_informes.py (con --drive) desde tu PC; aquí solo se lee.
     Se adopta si es más reciente que el que ya tienes. No cuenta como edición tuya (no dispara subidas). */
  async function traerInformes() {
    try {
      const r = await api(API + '?q=' + encodeURIComponent("name='" + NAME_INF + "' and trashed=false") + '&fields=files(id,modifiedTime)&spaces=drive&pageSize=5');
      const f = ((await r.json()).files || []).sort((a, b) => (a.modifiedTime < b.modifiedTime ? 1 : -1))[0]; if (!f) return false;
      const o = await bajar(f.id), d = Store.get();
      if (!o || !Array.isArray(o.empresas) || (d.informes && (d.informes.generado || '') >= (o.generado || ''))) return false;
      d.informes = o; Store.save(true); onDatos(); return true;
    } catch (e) { if (/sesión caducada/.test(e.message)) throw e; return false; }
  }

  /* Sincroniza: decide si bajar, subir o preguntar. «synced» = updatedAt de la última versión que coincidió con Drive. */
  async function sincronizar(interactivo) {
    if (ocupado) { pendiente = true; return; }
    ocupado = true; set('sync', 'sincronizando…');
    try {
      await conseguirToken(interactivo);
      await traerInformes();
      const loc = Store.get(), m = meta(); let f = null;
      if (m.fileId) { try { f = { id: m.fileId }; var remoto = await bajar(m.fileId); } catch (e) { if (/404/.test(e.message)) { f = null; } else throw e; } }
      if (!f) { f = await buscar(); if (f) var remoto = await bajar(f.id); }
      if (!f) {                                              // primera vez: crea el archivo con lo que hay aquí
        if (!loc.posiciones.length && !Object.keys(loc.fichas).length) { set('on', 'conectado (sin datos aún)'); setMeta({ on: true }); return; }
        const id = await subir(null, Store.exportar()); setMeta({ on: true, fileId: id, synced: loc.updatedAt }); set('on', 'creado en tu Drive'); return;
      }
      const rU = remoto.updatedAt || 0, lU = loc.updatedAt || 0, sy = m.synced || 0;
      const localCambiado = lU !== sy, remotoCambiado = rU !== sy;
      if (!localCambiado && !remotoCambiado) { setMeta({ on: true, fileId: f.id }); set('on', 'al día'); return; }
      if (remotoCambiado && !localCambiado) { Store.adopt(remoto); setMeta({ on: true, fileId: f.id, synced: rU }); onDatos(); set('on', 'actualizado desde Drive'); return; }
      if (localCambiado && !remotoCambiado) { await subir(f.id, Store.exportar()); setMeta({ on: true, fileId: f.id, synced: lU }); set('on', 'guardado en Drive'); return; }
      // Cambios en los dos lados desde la última sincronización: decide el usuario (nunca se pisa en silencio)
      const vacio = !loc.posiciones.length && !Object.keys(loc.fichas).length;
      const eleg = vacio ? 'drive' : (preguntar ? await preguntar(lU, rU) : 'cancelar');
      if (eleg === 'drive') { Store.adopt(remoto); setMeta({ on: true, fileId: f.id, synced: rU }); onDatos(); set('on', 'actualizado desde Drive'); }
      else if (eleg === 'local') { await subir(f.id, Store.exportar()); setMeta({ on: true, fileId: f.id, synced: lU }); set('on', 'guardado en Drive'); }
      else set('conflicto', 'hay cambios distintos en Drive y aquí');
    } catch (e) {
      set(/caducada|popup|cancel|access_denied|interaction|immediate/i.test(e.message) ? 'reconectar' : 'error', e.message);
    } finally { ocupado = false; if (pendiente) { pendiente = false; programar(); } }
  }
  function programar() { clearTimeout(timer); if (!meta().on) return; timer = setTimeout(() => sincronizar(false), 2500); }

  return {
    init(o) {
      onEstado = o.onEstado; onDatos = o.onDatos; preguntar = o.preguntar;
      if (meta().on) { set('reconectar', 'toca para reconectar'); sincronizar(false); } else set('off');
      Store.onChange(() => programar());
      document.addEventListener('visibilitychange', () => { if (!document.hidden && meta().on && token) sincronizar(false); });
    },
    conectar() { return sincronizar(true); },
    ahora() { return sincronizar(true); },
    desconectar() { try { localStorage.removeItem(MK); } catch (e) { } if (token && window.google) try { google.accounts.oauth2.revoke(token, () => { }); } catch (e) { } token = null; set('off'); },
    estado: () => ({ estado, detalle, conectado: !!meta().on })
  };
})();
