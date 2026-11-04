/* Datos de empresas desde internet (SEC EDGAR) a través de un workflow de GitHub Actions.
   El navegador no puede llamar a la SEC (CORS): el workflow «Datos de empresa» guarda datos/TICKER.json en el repositorio y la app lo lee.
   Para lanzarlo desde la app hace falta un token de GitHub (solo en este dispositivo); sin token se lanza a mano desde la pestaña Actions. */
const DatosWeb = (function () {
  const REPO = 'wanlida02/mi-cartera', RAMA = 'main', KT = 'mc_gh_token';
  const arch = tk => String(tk).toUpperCase().replace(/[^A-Z0-9]/g, '_') + '.json';
  const token = () => { try { return localStorage.getItem(KT) || ''; } catch (e) { return ''; } };
  const setToken = t => { try { t ? localStorage.setItem(KT, t.trim()) : localStorage.removeItem(KT); } catch (e) {} };
  const urlActions = () => 'https://github.com/' + REPO + '/actions/workflows/datos.yml';
  /* Lee datos/TICKER.json del repositorio (API de contenidos: sin caché de Pages). null si no existe. */
  async function leer(tk) {
    const r = await fetch('https://api.github.com/repos/' + REPO + '/contents/datos/' + arch(tk) + '?ref=' + RAMA + '&t=' + Date.now(), { headers: { Accept: 'application/vnd.github.raw+json' }, cache: 'no-store' });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('GitHub respondió ' + r.status);
    return await r.json();
  }
  /* Lee un archivo del repositorio (JSON) sin pasar por la caché de Pages */
  async function leerArchivo(ruta) {
    const r = await fetch('https://api.github.com/repos/' + REPO + '/contents/' + ruta + '?ref=' + RAMA + '&t=' + Date.now(), { headers: Object.assign({ Accept: 'application/vnd.github.raw+json' }, token() ? { Authorization: 'Bearer ' + token() } : {}), cache: 'no-store' });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('GitHub respondió ' + r.status);
    return await r.json();
  }
  /* Lanza un workflow (workflow_dispatch) con el token del dispositivo */
  async function lanzarWorkflow(archivo, inputs) {
    const t = token(); if (!t) return { ok: false, sinToken: true };
    const r = await fetch('https://api.github.com/repos/' + REPO + '/actions/workflows/' + archivo + '/dispatches', { method: 'POST', headers: { Authorization: 'Bearer ' + t, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: RAMA, inputs: inputs || {} }) });
    if (r.status === 204) return { ok: true };
    return { ok: false, msg: r.status === 401 || r.status === 403 || r.status === 404 ? 'El token no es válido o no tiene permiso de Actions (Read and write) sobre ' + REPO : 'GitHub respondió ' + r.status };
  }
  async function lanzar(tk) {
    const t = token(); if (!t) return { ok: false, sinToken: true };
    const r = await fetch('https://api.github.com/repos/' + REPO + '/actions/workflows/datos.yml/dispatches', { method: 'POST', headers: { Authorization: 'Bearer ' + t, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: RAMA, inputs: { ticker: tk } }) });
    if (r.status === 204) return { ok: true };
    return { ok: false, msg: r.status === 401 || r.status === 403 || r.status === 404 ? 'El token no es válido o no tiene permiso de Actions (Read and write) sobre ' + REPO : 'GitHub respondió ' + r.status };
  }
  /* Espera a que el archivo sea más nuevo que `desde` (ms). */
  async function esperar(tk, desde, progreso, max) {
    const fin = Date.now() + (max || 240000);
    while (Date.now() < fin) {
      await new Promise(r => setTimeout(r, DatosWeb.pausa));
      let o = null; try { o = await leer(tk); } catch (e) { }
      if (o && Date.parse(o.generado) >= desde - 5000) return o;
      if (progreso) progreso(Math.round((Date.now() - desde) / 1000));
    }
    return null;
  }
  /* Convierte el archivo en ficha borrador (misma forma que «Nueva ficha») */
  function aFicha(o, hoy) {
    const an = o.anios.map(Number), n = an.length, f = { ticker: o.ticker, nombre: o.nombre || o.ticker, divisa: o.divisa || 'USD', anio_base: an[n - 1], anios: an, leases_ok: true, hist: {}, conf: {}, fuentes: [o.fuente + (o.cik ? ' · CIK ' + o.cik : '')], notas: (o.notas || []).slice(), fecha_datos: (o.generado || '').slice(0, 10) || hoy, _borrador: true };
    Object.keys(o.hist || {}).forEach(k => { const s = o.hist[k]; if (Array.isArray(s) && s.length === n) { f.hist[k] = s.map(v => (typeof v === 'number' && isFinite(v) ? v : null)); f.conf[k] = s.some(v => typeof v === 'number') ? 'P' : 'E'; } });
    if (o.faltan && o.faltan.length) f.notas.push('Sin datos en la SEC para: ' + o.faltan.join(', ') + '. Complétalos a mano.');
    if (o.precio && o.precio.precio > 0) { f.precio = o.precio.precio; f.fecha_precio = o.precio.fecha || hoy; f.fuente_precio = 'internet'; }
    return f;
  }
  /* Ficha borrador a partir de las cifras del CSV de informes (empresas no americanas). Millones; acciones = beneficio neto / BPA diluido. */
  /* Qué cifras necesarias faltan en el resumen del CSV (para explicarlo en pantalla) */
  function faltanInformes(e) {
    const dt = e && e.datos, m = dt && dt.metricas; if (!m || !Array.isArray(dt.anios) || dt.anios.length < 2) return ['el resumen de cifras (¿hay un archivo *_datos.csv en la carpeta y has vuelto a ejecutar indice_informes.py?)'];
    return ['Ventas', 'Beneficio operativo (EBIT)', 'Beneficio neto', 'BPA diluido'].filter(k => !(m[k] || []).some(v => typeof v === 'number' && isFinite(v)));
  }
  function aFichaInformes(e, hoy) {
    const dt = e && e.datos, m = dt && dt.metricas; if (!m || !Array.isArray(dt.anios) || dt.anios.length < 2) return null;
    const an = dt.anios.map(Number), n = an.length, num = v => (typeof v === 'number' && isFinite(v) ? v : null), ser = k => (m[k] || []).slice(0, n).map(num);
    const V = ser('Ventas'), E = ser('Beneficio operativo (EBIT)'), NI = ser('Beneficio neto'), B = ser('BPA diluido');
    if (!V.some(x => x != null) || !E.some(x => x != null) || !NI.some(x => x != null) || !B.some(x => x != null)) return null;
    while (V.length < n) V.push(null);
    const A = NI.map((x, i) => (x != null && B[i] != null && B[i] > 0 ? Math.round(x / B[i] * 10) / 10 : null));
    const last = k => { const s = ser(k); for (let i = s.length - 1; i >= 0; i--) if (s[i] != null) return s[i]; return null; };
    const f = { ticker: e.tk, nombre: e.nombre || e.tk, divisa: dt.divisa || 'EUR', anio_base: an[n - 1], anios: an, leases_ok: true, hist: { ventas: V, ebit: E, ni_reportado: NI, acciones: A, bpa: B }, conf: { ventas: 'P', ebit: 'P', ni_reportado: 'P', acciones: 'E', bpa: 'P' },
      fuentes: ['Cifras clave de los informes anuales (' + (e.csv || 'CSV') + ')'], notas: ['Ficha borrador creada desde el resumen de tus informes (' + n + ' años). Acciones estimadas como beneficio neto / BPA diluido. Faltan deuda, caja, patrimonio, amortizaciones, capex y dividendos: complétalos desde el informe.'], fecha_datos: (e.generado || '').slice(0, 10) || hoy, _borrador: true, extra_cribado: {} };
    const dne = last('Deuda neta / EBITDA'), fps = last('FCF / acción'), roe = last('ROE %');
    if (dne != null) f.extra_cribado.deuda_neta_ebitda = dne;
    if (fps != null) f.extra_cribado.fcf_por_accion = fps;
    if (roe != null) f.notas.push('ROE del último año según el CSV: ' + roe + ' %.');
    return f;
  }
  /* Lista de precios: qué cambia en simbolos.json para que las candidatas (pasa/vigilar) se actualicen y las descartadas se pausen.
     deseados = {TK: {pausa:bool}}. Nunca pausa ni borra lo que no se pide; los símbolos nuevos usan el propio ticker (EE. UU.). */
  function planSimbolos(simb, deseados) {
    const nuevo = JSON.parse(JSON.stringify(simb || {})), anadir = [], pausar = [], reactivar = [];
    Object.keys(deseados || {}).forEach(tk => {
      const c = nuevo[tk], p = !!deseados[tk].pausa;
      if (!c) { if (!p) { nuevo[tk] = { y: [tk] }; anadir.push(tk); } return; }   // una descartada que nunca tuvo precio no se añade
      if (p && !c.pausa) { c.pausa = true; pausar.push(tk); }
      else if (!p && c.pausa) { delete c.pausa; reactivar.push(tk); }
    });
    return { nuevo, anadir, pausar, reactivar, cambios: anadir.length + pausar.length + reactivar.length };
  }
  /* Escribe un archivo del repositorio (hace falta token con Contents: Read and write) */
  async function escribirArchivo(ruta, texto, msg) {
    const t = token(); if (!t) return { ok: false, sinToken: true };
    const h = { Authorization: 'Bearer ' + t, Accept: 'application/vnd.github+json' }, url = 'https://api.github.com/repos/' + REPO + '/contents/' + ruta;
    const g = await fetch(url + '?ref=' + RAMA + '&t=' + Date.now(), { headers: h, cache: 'no-store' });
    if (!g.ok) return { ok: false, msg: g.status === 401 || g.status === 403 || g.status === 404 ? 'El token no tiene permiso Contents (Read and write) sobre ' + REPO : 'GitHub respondió ' + g.status };
    const sha = (await g.json()).sha, b64 = btoa(unescape(encodeURIComponent(texto)));
    const r = await fetch(url, { method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/json' }, h), body: JSON.stringify({ message: msg, content: b64, sha, branch: RAMA }) });
    return r.ok ? { ok: true } : { ok: false, msg: r.status === 403 || r.status === 404 ? 'El token no tiene permiso Contents (Read and write) sobre ' + REPO : r.status === 409 || r.status === 422 ? 'El archivo cambió mientras tanto; vuelve a intentarlo' : 'GitHub respondió ' + r.status };
  }
  return { faltanInformes, planSimbolos, escribirArchivo, aFichaInformes, pausa: 7000, leerArchivo, lanzarWorkflow, token, setToken, leer, lanzar, esperar, aFicha, urlActions, arch };
})();
if (typeof module !== 'undefined') module.exports = DatosWeb;
