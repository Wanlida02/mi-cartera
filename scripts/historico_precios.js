#!/usr/bin/env node
/* Histórico de precios de cierre mensuales (12 años) de cada valor de simbolos.json → datos/precios_anuales.json.
   Sirve para calcular los múltiplos «de siempre» de cada empresa (lo que el mercado pagó al cierre de cada ejercicio) en vez de usar 15x/9x genéricos.
   Se ejecuta en GitHub Actions (domingo) o a mano: node scripts/historico_precios.js [--solo TK,TK]
   Reglas: si falla un valor conserva el histórico anterior; los precios van ajustados por splits (Yahoo) y se guardan los splits para contrastar con las acciones de la ficha;
   la divisa es la que declara Yahoo (el motor solo usa el histórico si coincide con la de la ficha). */
const fs = require('fs'), path = require('path');
const RAIZ = path.join(__dirname, '..'), EXTRA = (process.argv.find(a => a.startsWith('--extra=')) || '').slice(8).split(',').map(x => x.trim()).filter(Boolean);   // --extra=TK,TK: tickers de EE. UU. solo para backtests → datos/precios_backtest.json
const OUT = path.join(RAIZ, 'datos', EXTRA.length ? 'precios_backtest.json' : 'precios_anuales.json');
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
/* CNBC (funciona desde GitHub; Yahoo y Stooq no): gráfico histórico «ALL» (o 10Y/5Y) con cierres ajustados por splits. Símbolo igual que en actualizar_precios.js: US tal cual; resto SIMBOLO-PAÍS */
const CPAIS = { MC: ['ES', 'EUR'], PA: ['FR', 'EUR'], AT: ['GR', 'EUR'], TW: ['TW', 'TWD'], HK: ['HK', 'HKD'], L: ['GB', 'GBP'], DE: ['DE', 'EUR'], MI: ['IT', 'EUR'], AS: ['NL', 'EUR'], SW: ['CH', 'CHF'], ST: ['SE', 'SEK'], T: ['JP', 'JPY'], SZ: ['CN', 'CNY'] };
/* ¿La serie es del mismo valor? El último cierre debe parecerse al precio actual (±35 %); si no (símbolo equivocado, otra clase de acción) se rechaza. */
function coherente(h, precioActual) {
  const ks = Object.keys(h.cierres).sort(), u = h.cierres[ks[ks.length - 1]]; if (!(precioActual > 0) || !u) throw new Error('sin precio actual con el que contrastar la serie');
  const lim = new Date(Date.now() - 75 * 864e5).toISOString().slice(0, 7); if (ks[ks.length - 1] < lim) throw new Error('la serie termina en ' + ks[ks.length - 1] + ' (valor sin cotización reciente)');
  const r = u / precioActual; if (r < 0.65 || r > 1.35) throw new Error('el histórico (' + u + ') no cuadra con el precio actual (' + precioActual + ')'); return true;
}
function leerCnbcHist(j, divisa) {
  const b = j && j.barData && j.barData.priceBars; if (!Array.isArray(b) || b.length < 12) throw new Error('CNBC sin histórico'); const cierres = {};
  b.forEach(x => { const t = String(x.tradeTime || ''), v = num(Number(x.close)); if (v && /^\d{8}/.test(t)) cierres[t.slice(0, 4) + '-' + t.slice(4, 6)] = Math.round(v * 1e4) / 1e4; });   // barras ordenadas por fecha: queda el último cierre de cada mes
  if (Object.keys(cierres).length < 12) throw new Error('histórico demasiado corto'); return { divisa, cierres, splits: [], fuente: 'cnbc' };
}
async function cnbcHist(sym, divisa) {
  const m = sym.match(/^(.+)\.([A-Z]+)$/); let c = sym, dv = divisa || 'USD';
  if (m) { const x = CPAIS[m[2]]; if (!x) throw new Error('CNBC: bolsa desconocida'); c = m[1] + '-' + x[0]; dv = divisa || x[1]; }
  let ult; for (const rg of ['10Y', 'ALL', '5Y']) { try { const r = await fetch('https://ts-api.cnbc.com/harmony/app/charts/' + rg + '.json?symbol=' + encodeURIComponent(c), { headers: UA, signal: AbortSignal.timeout(30000) }); if (!r.ok) throw new Error('CNBC HTTP ' + r.status); const h = leerCnbcHist(await r.json(), dv); h.rango = rg; return h; } catch (e) { ult = e; } }
  throw ult;
}
let n429 = 0, yahooOff = false;
async function pedirHist(sym, divisa) {
  try { return await cnbcHist(sym, divisa); } catch (e) { if (yahooOff) throw e; try { return await pedirYahoo(sym); } catch (e2) { if (/429|sin respuesta/.test(e2.message)) yahooOff = true; throw new Error('CNBC: ' + e.message + ' · Yahoo: ' + e2.message); } }
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
/* Sonda de proveedores: qué responde desde GitHub (para elegir fuente); imprime estado y el principio de la respuesta */
async function sonda() {
  const u = [['yahoo', 'https://query1.finance.yahoo.com/v8/finance/chart/AAPL?range=12y&interval=1mo'], ['stooq.com', 'https://stooq.com/q/d/l/?s=aapl.us&i=m'], ['stooq.pl', 'https://stooq.pl/q/d/l/?s=aapl.us&i=m'],
    ['cnbc-bars', 'https://ts-api.cnbc.com/harmony/app/bars/AAPL/1M/20150101000000/20261117000000/adjusted/EST5EDT.json'], ['cnbc-charts', 'https://ts-api.cnbc.com/harmony/app/charts/5Y.json?symbol=AAPL'],
    ['nasdaq', 'https://api.nasdaq.com/api/quote/AAPL/historical?assetclass=stocks&fromdate=2015-01-01&limit=20&todate=2026-11-17&todate=2026-11-17'],
    ['tencent-us', 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=usAAPL.OQ,month,,,150,qfq'], ['tencent-hk', 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=hk03750,month,,,150,qfq'], ['tencent-es', 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=sz300750,month,,,150,qfq'],
    ['google', 'https://www.google.com/finance/quote/AAPL:NASDAQ?hl=en'], ['alpha-demo', 'https://www.alphavantage.co/query?function=TIME_SERIES_MONTHLY_ADJUSTED&symbol=IBM&apikey=demo'], ['eod-demo', 'https://eodhd.com/api/eod/AAPL.US?api_token=demo&period=m&fmt=json&from=2020-01-01'],
    ['marketstack', 'https://api.marketstack.com/v1/eod?access_key=demo&symbols=AAPL'], ['fmp-demo', 'https://financialmodelingprep.com/api/v3/historical-price-full/AAPL?apikey=demo&serietype=line'], ['investing', 'https://api.investing.com/api/financialdata/6408/historical/chart/?period=P5Y&interval=P1M&pointscount=120']];
  for (const [n, url] of u) { try { const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20000) }); const t = (await r.text()).replace(/\s+/g, ' ').slice(0, 140); console.log('SONDA ' + n + ' → HTTP ' + r.status + ' · ' + t); } catch (e) { console.log('SONDA ' + n + ' → ERROR ' + e.message); } await esperar(400); }
}
/* Algunas fuentes dan la serie de Londres en peniques (GBp) aunque el precio actual esté en libras: si el último cierre es ~100 veces el precio, se pasa a libras */
function peniques(h, pr) {
  const ks = Object.keys(h.cierres).sort(), u = h.cierres[ks[ks.length - 1]];
  if (!pr || !(pr.precio > 0) || !u || !/^(GBP|ILS)$/.test(pr.divisa || h.divisa) || !(u / pr.precio > 65 && u / pr.precio < 135)) return h;
  const c = {}; ks.forEach(k => { c[k] = Math.round(h.cierres[k] * 100) / 1e4; }); return Object.assign({}, h, { cierres: c, divisa: pr.divisa });
}
async function main() {
  if (process.argv.includes('--sonda')) return sonda();
  const cfg = EXTRA.length ? { simbolos: Object.fromEntries(EXTRA.map(t => [t, { y: [t] }])) } : JSON.parse(fs.readFileSync(path.join(RAIZ, 'simbolos.json'), 'utf8')), solo = (process.argv.find(a => a.startsWith('--solo=')) || '').slice(7).split(',').filter(Boolean);
  let prev = {}; try { prev = JSON.parse(fs.readFileSync(OUT, 'utf8')).simbolos || {}; } catch (e) { /* primera vez */ }
  let precios = {}; try { precios = JSON.parse(fs.readFileSync(path.join(RAIZ, 'precios.json'), 'utf8')).precios || {}; } catch (e) { /* sin divisas conocidas: se usa la del país */ }
  const sim = {}, fallos = [];   // se parte de cero: lo anterior solo se conserva si este valor falla y sigue cuadrando con el precio actual
  for (const tk of Object.keys(cfg.simbolos)) {
    const c = cfg.simbolos[tk]; if (solo.length && !solo.includes(tk)) continue;   // también los valores con precios en pausa: aquí se intenta igualmente
    let ok = null, ult;
    for (const s of candidatos(c)) { try { const pr = precios[s === c.ficha ? tk + '@ficha' : tk]; const h = peniques(await pedirHist(s, pr && pr.divisa), pr); if (!EXTRA.length) coherente(h, pr && pr.precio); ok = Object.assign({ simbolo: s }, h); break; } catch (e) { ult = e; } await esperar(500); }
    if (ok) sim[tk] = Object.assign(ok, { actualizado: new Date().toISOString() });
    else { fallos.push({ ticker: tk, error: ult && ult.message }); try { if (prev[tk]) { coherente(prev[tk], (precios[tk] || {}).precio); sim[tk] = prev[tk]; } } catch (e) { /* el anterior tampoco vale */ } }
    await esperar(700);
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ generado: new Date().toISOString(), simbolos: sim, fallos }) + '\n');
  console.log('Histórico: ' + Object.keys(sim).length + ' valores · fallos: ' + (fallos.map(f => f.ticker).join(', ') || 'ninguno'));
}
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { peniques, coherente, leerCnbcHist, leerStooqHist, leerHistorico, candidatos, mesLocal };
