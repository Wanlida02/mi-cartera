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
  return { pausa: 7000, token, setToken, leer, lanzar, esperar, aFicha, urlActions, arch };
})();
if (typeof module !== 'undefined') module.exports = DatosWeb;
