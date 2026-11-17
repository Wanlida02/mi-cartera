#!/usr/bin/env node
/* Histórico de precios de cierre mensuales (12 años) de cada valor de simbolos.json → datos/precios_anuales.json.
   Sirve para calcular los múltiplos «de siempre» de cada empresa (lo que el mercado pagó al cierre de cada ejercicio) en vez de usar 15x/9x genéricos.
   Se ejecuta en GitHub Actions (domingo) o a mano: node scripts/historico_precios.js [--solo TK,TK]
   Reglas: si falla un valor conserva el histórico anterior; los precios van ajustados por splits (Yahoo) y se guardan los splits para contrastar con las acciones de la ficha;
   la divisa es la que declara Yahoo (el motor solo usa el histórico si coincide con la de la ficha). */
const fs = require('fs'), path = require('path');
const RAIZ = path.join(__dirname, '..'), OUT = path.join(RAIZ, 'datos', 'precios_anuales.json');
const UA = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36', Accept: 'application/json,*/*' };
const esperar = ms => new Promise(r => setTimeout(r, ms));
const num = v => (typeof v === 'number' && isFinite(v) && v > 0 ? v : null);
function mesLocal(epoch, tz) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC', year: 'numeric', month: '2-digit' }).format(new Date(epoch * 1000)).slice(0, 7); }
  catch (e) { return new Date(epoch * 1000).toISOString().slice(0, 7); }
}
/* Yahoo (range=12y&interval=1mo&events=split) → {divisa, cierres:{'AAAA-MM':precio}, splits:[{fecha,num,den}]}  (función pura, probada en tests/historico_multiplos.test.js) */
function leerHistorico(j) {
  const r = j && j.chart && j.chart.result && j.chart.result[0]; if (!r || !r.meta || !Array.isArray(r.timestamp)) throw new Error('respuesta sin datos');
  let div = r.meta.currency, k = 1; if (!div) throw new Error('sin divisa');
  if (div === 'GBp' || div === 'GBX') { k = 0.01; div = 'GBP'; } if (div === 'ILA') { k = 0.01; div = 'ILS'; }
  const c = ((r.indicators || {}).quote || [{}])[0].close || [], cierres = {};
  r.timestamp.forEach((t, i) => { const v = num(c[i]); if (v) cierres[mesLocal(t, r.meta.exchangeTimezoneName)] = Math.round(v * k * 1e4) / 1e4; });
  const sp = ((r.events || {}).splits) || {}, splits = Object.keys(sp).map(t => ({ fecha: new Date((sp[t].date || +t) * 1000).toISOString().slice(0, 10), num: sp[t].numerator, den: sp[t].denominator })).filter(x => x.num > 0 && x.den > 0).sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (Object.keys(cierres).length < 12) throw new Error('histórico demasiado corto');
  return { divisa: div, cierres, splits };
}
/* Stooq (CSV mensual «Date,Open,High,Low,Close,Volume»; precios ajustados por splits): respaldo cuando Yahoo limita (429) desde GitHub. Cubre EE. UU., Reino Unido (peniques) y Alemania; no España/Francia/Italia. */
const STOOQ = { '': ['us', 'USD', 1], L: ['uk', 'GBP', 0.01], DE: ['de', 'EUR', 1] };
function leerStooqHist(csv, divisa, k) {
  const lin = String(csv).trim().split(/\r?\n/); if (!/^Date,/i.test(lin[0] || '')) throw new Error('Stooq sin datos'); const cierres = {};
  lin.slice(1).forEach(l => { const c = l.split(','), v = num(Number(c[4])); if (v && /^\d{4}-\d\d-\d\d$/.test(c[0])) cierres[c[0].slice(0, 7)] = Math.round(v * (k || 1) * 1e4) / 1e4; });
  if (Object.keys(cierres).length < 12) throw new Error('histórico demasiado corto'); return { divisa, cierres, splits: [], fuente: 'stooq' };
}
async function stooqHist(sym) {
  const m = sym.match(/^(.+?)(?:\.([A-Z]+))?$/), suf = m[2] || ''; const x = STOOQ[suf]; if (!x) throw new Error('Stooq no cubre ' + (suf || sym));
  const r = await fetch('https://stooq.com/q/d/l/?s=' + m[1].toLowerCase().replace(/[^a-z0-9.]/g, '') + '.' + x[0] + '&i=m', { headers: UA, signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw new Error('Stooq HTTP ' + r.status); return leerStooqHist(await r.text(), x[1], x[2]);
}
let n429 = 0, yahooOff = false;
async function pedirHist(sym) {
  if (yahooOff) return stooqHist(sym);
  try { return await pedirYahoo(sym); } catch (e) { if (/429|sin respuesta/.test(e.message)) { yahooOff = true; } try { return await stooqHist(sym); } catch (e2) { throw new Error('Yahoo: ' + e.message + ' · Stooq: ' + e2.message); } }
}
async function pedirYahoo(sym) {
  for (const host of ['query1', 'query2']) {
    for (let i = 0; i < 2; i++) {
      try {
        const r = await fetch('https://' + host + '.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(sym) + '?range=12y&interval=1mo&events=split', { headers: UA, signal: AbortSignal.timeout(25000) });
        if (r.ok) { n429 = 0; return leerHistorico(await r.json()); }
        if (r.status === 404) throw new Error('HTTP 404');
        if (r.status === 429 && ++n429 >= 6) throw new Error('Yahoo limitado (429): se omite');
      } catch (e) { if (/404|429|corto|sin datos|sin divisa/.test(e.message) && host === 'query2') throw e; if (/429/.test(e.message)) throw e; }
      await esperar(900 * (i + 1));
    }
  }
  throw new Error('sin respuesta');
}
/* símbolos a probar para un valor: el específico de histórico, el de la ficha (divisa de las cuentas) y luego los de cotización */
const candidatos = c => [c.hist, c.ficha].concat(c.y || []).filter((x, i, a) => x && a.indexOf(x) === i);
async function main() {
  const cfg = JSON.parse(fs.readFileSync(path.join(RAIZ, 'simbolos.json'), 'utf8')), solo = (process.argv.find(a => a.startsWith('--solo=')) || '').slice(7).split(',').filter(Boolean);
  let prev = {}; try { prev = JSON.parse(fs.readFileSync(OUT, 'utf8')).simbolos || {}; } catch (e) { /* primera vez */ }
  const sim = Object.assign({}, prev), fallos = [];
  for (const tk of Object.keys(cfg.simbolos)) {
    const c = cfg.simbolos[tk]; if (c.pausa || (solo.length && !solo.includes(tk))) continue;
    let ok = null, ult;
    for (const s of candidatos(c)) { try { const h = await pedirHist(s); ok = Object.assign({ simbolo: s }, h); break; } catch (e) { ult = e; } await esperar(500); }
    if (ok) sim[tk] = Object.assign(ok, { actualizado: new Date().toISOString() }); else fallos.push({ ticker: tk, error: ult && ult.message });
    await esperar(700);
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ generado: new Date().toISOString(), simbolos: sim, fallos }) + '\n');
  console.log('Histórico: ' + Object.keys(sim).length + ' valores · fallos: ' + (fallos.map(f => f.ticker).join(', ') || 'ninguno'));
}
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { leerStooqHist, leerHistorico, candidatos, mesLocal };
