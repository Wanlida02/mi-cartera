/* Calendario de próximos resultados → calendario_resultados.json
   EE. UU. (de simbolos.json, sin sufijo de mercado):
     1) Nasdaq (fecha anunciada o proyectada), si responde desde el servidor.
     2) SEC EDGAR: los 8-K con «Item 2.02» (nota de resultados) del último año → próxima fecha estimada = misma presentación del año anterior + 364 días (mismo día de la semana).
   Fuera de EE. UU. no hay fuente pública fiable: se conserva lo que ya hubiera y el resto se pide a una IA desde la app.
   Uso: node scripts/calendario.js [--solo AAPL,LIN] [--salida ruta.json] */
const fs = require('fs'), path = require('path');
const RAIZ = path.join(__dirname, '..'), UA = { 'User-Agent': process.env.SEC_UA || 'mi-cartera-app', Accept: 'application/json' };
const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const OUT = arg('--salida') || path.join(RAIZ, 'calendario_resultados.json');
const hoy = () => new Date().toISOString().slice(0, 10);
const sumar = (f, d) => new Date(Date.parse(f) + d * 864e5).toISOString().slice(0, 10);
const esperar = ms => new Promise(r => setTimeout(r, ms));
async function pedir(url, extra, intentos, ms) {
  let ult; for (let i = 0; i < (intentos || 3); i++) { try { const r = await fetch(url, { headers: Object.assign({}, UA, extra || {}), signal: AbortSignal.timeout(ms || 25000) }); if (r.ok) return r; ult = new Error('HTTP ' + r.status); if (r.status === 404) break; } catch (e) { ult = e; } await esperar(1200 * (i + 1)); }
  throw ult;
}
/* Fechas de notas de resultados (8-K Item 2.02) ordenadas */
function fechas202(sub) {
  const r = sub && sub.filings && sub.filings.recent; if (!r || !r.form) return [];
  const out = []; r.form.forEach((f, i) => { if (f === '8-K' && /(^|,)\s*2\.02\s*(,|$)/.test(r.items[i] || '')) out.push(r.filingDate[i]); });
  return [...new Set(out)].sort();
}
/* Próxima presentación estimada a partir del historial */
function estimar(fs202, h) {
  if (fs202.length < 2) return null;
  const lim = sumar(h, -400), recientes = fs202.filter(f => f >= lim);
  const cand = recientes.map(f => sumar(f, 364)).filter(f => f >= h).sort();
  if (cand.length) return cand[0];
  const ult = fs202[fs202.length - 1]; let n = sumar(ult, 91); while (n < h) n = sumar(n, 91); return n;   // sin patrón anual: trimestre siguiente
}
const MES = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function leerNasdaq(j) {
  const t = j && j.data && (j.data.reportText || j.data.announcement || ''); const m = /([A-Za-z]{3})[a-z]*\s+(\d{1,2}),\s*(\d{4})/.exec(t || '');
  if (!m || !MES[m[1].toLowerCase()]) return null;
  return m[3] + '-' + String(MES[m[1].toLowerCase()]).padStart(2, '0') + '-' + String(m[2]).padStart(2, '0');
}
let fallosNasdaq = 0;   // si Nasdaq no responde desde el servidor, se deja de insistir en esta ejecución
async function nasdaq(tk) {
  if (fallosNasdaq >= 2) throw new Error('omitido');
  let r; try { r = await pedir('https://api.nasdaq.com/api/analyst/' + encodeURIComponent(tk) + '/earnings-date', { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36', Accept: 'application/json, text/plain, */*', Origin: 'https://www.nasdaq.com', Referer: 'https://www.nasdaq.com/' }, 1, 8000); fallosNasdaq = 0; } catch (e) { fallosNasdaq++; throw e; }
  return leerNasdaq(await r.json());
}
async function principal() {
  const h = hoy(), cfg = JSON.parse(fs.readFileSync(path.join(RAIZ, 'simbolos.json'), 'utf8')).simbolos;
  let previo = {}; try { previo = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) { /* primera vez */ }
  const solo = arg('--solo'), fechas = {}, resumen = { sec: 0, nasdaq: 0, conservadas: 0, sin: [] };
  Object.keys(previo.fechas || {}).forEach(k => { const e = previo.fechas[k]; if (e && e.fecha >= sumar(h, -2)) fechas[k] = e; });
  const mapa = {};   // CIK de cada empresa: los guarda datos_sec.js en datos/<TK>.json
  try { fs.readdirSync(path.join(RAIZ, 'datos')).forEach(f => { if (!/^[A-Z0-9.-]+\.json$/.test(f) || f === 'resumen.json') return; try { const j = JSON.parse(fs.readFileSync(path.join(RAIZ, 'datos', f), 'utf8')); if (j.cik) mapa[(j.ticker || f.replace('.json', '')).toUpperCase()] = j.cik; } catch (e) { /* ilegible */ } }); } catch (e) { /* sin carpeta */ }
  const lista = Object.keys(cfg).filter(k => !cfg[k].pausa && !/\s/.test(k) && (!solo || solo.split(',').includes(k)));
  for (const tk of lista) {
    const sym = (cfg[tk].y || [])[0] || tk; if (/\./.test(sym) || !/^[A-Z]{1,5}$/.test(sym)) { if (!fechas[tk]) resumen.sin.push(tk); else resumen.conservadas++; continue; }   // no es de EE. UU.
    let nd = null, es = null; const aviso = [];
    try { nd = await nasdaq(sym); } catch (e) { aviso.push('nasdaq: ' + e.message); }
    if (nd && nd >= h) { fechas[tk] = { fecha: nd, confirmada: false, fuente: 'Nasdaq' }; resumen.nasdaq++; continue; }
    const cik = mapa[sym.toUpperCase()];
    if (cik) { try { const sub = await (await pedir('https://data.sec.gov/submissions/CIK' + cik + '.json')).json(); const f = fechas202(sub); es = estimar(f, h); if (es) { fechas[tk] = { fecha: es, confirmada: false, fuente: 'SEC: misma fecha del año anterior', ultima: f[f.length - 1] }; resumen.sec++; continue; } aviso.push('sin historial 8-K 2.02'); } catch (e) { aviso.push('sec: ' + e.message); } }
    if (fechas[tk]) resumen.conservadas++; else resumen.sin.push(tk + (aviso.length ? ' (' + aviso.join('; ') + ')' : ''));
    await esperar(150);
  }
  const salida = { generado: h, nota: 'Fechas públicas de próximos resultados. confirmada=true: anunciada por la empresa. false: estimada (Nasdaq, o misma presentación del año anterior según la SEC); verifícala en la web de la empresa.', fechas };
  if (!solo) fs.writeFileSync(OUT, JSON.stringify(salida, null, 1) + '\n'); else console.log(JSON.stringify(fechas, null, 1));
  console.log('Calendario: Nasdaq ' + resumen.nasdaq + ' · SEC ' + resumen.sec + ' · conservadas ' + resumen.conservadas + ' · sin fecha ' + resumen.sin.length + (resumen.sin.length ? ': ' + resumen.sin.join(', ') : ''));
}
if (require.main === module) principal().catch(e => { console.error(e); process.exit(1); });
module.exports = { fechas202, estimar, leerNasdaq };
